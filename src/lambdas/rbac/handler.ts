/**
 * RBAC & Roles Management Lambda
 * 
 * Handles all Role-Based Access Control operations including:
 * - Public metadata endpoints (for registration)
 * - Private management endpoints (for admin)
 * - Legacy compatibility endpoints
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { RBACService } from '../../lib/auth/RBACService';
import { verifyJWT } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse } from '../../shared/response';

const logger = createLogger('rbac-service');

interface AuthenticatedUser {
    id: bigint;
    email: string;
    role: string;
    roles: Array<{ id: number; name: string; isPrimary: boolean }>;
    permissions: Array<{ name: string; resource: string; action: string }>;
}

/**
 * Authenticate Helper for Lambda
 */
async function authenticate(event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<AuthenticatedUser> {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Missing authentication token');
    }

    const token = authHeader.substring(7);
    const authResult = await verifyJWT(`Bearer ${token}`);

    if (!authResult.success || !authResult.user) {
        throw new Error(authResult.error || 'Invalid token');
    }

    const userId = BigInt(authResult.user.id);

    // Load RBAC data
    const rbacService = new RBACService(prisma);
    const rbacData = await rbacService.getUserRBAC(userId);

    // Load basic user info
    const user = await prisma.users.findUnique({
        where: { id: userId }
    });

    if (!user || user.account_status !== 'active') {
        throw new Error('User not found or inactive');
    }

    return {
        id: user.id,
        email: user.email,
        role: user.role,
        roles: rbacData.roles,
        permissions: rbacData.permissions
    };
}

function hasPermission(user: AuthenticatedUser, permission: string): boolean {
    return user.permissions.some(p => p.name === permission);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const requestId = event.requestContext.requestId;
    const { httpMethod, path, body, queryStringParameters, pathParameters } = event;
    const prisma = getPrisma();
    const rbacService = new RBACService(prisma);

    logger.info('RBAC Request', { requestId, httpMethod, path });

    try {
        // ============================================================================
        // PUBLIC ENDPOINTS (No Auth Required)
        // ============================================================================

        // GET /api/roles-metadata/all
        // GET /api/rbac/roles (Public view for simplicity? No, existing legacy says public for "all")
        if (httpMethod === 'GET' && path.endsWith('/roles-metadata/all')) {
            const roles = await prisma.roles.findMany({
                where: { is_active: true },
                orderBy: { display_name: 'asc' },
                select: { id: true, name: true, display_name: true, description: true }
            });
            return successResponse({ success: true, roles }, 'Roles retrieved', requestId);
        }

        // GET /api/roles-metadata/professional
        if (httpMethod === 'GET' && path.endsWith('/roles-metadata/professional')) {
            const roles = await prisma.roles.findMany({
                where: {
                    is_active: true,
                    name: { not: 'client' }
                },
                orderBy: { display_name: 'asc' },
                select: { id: true, name: true, display_name: true, description: true }
            });
            return successResponse({ success: true, roles }, 'Professional roles retrieved', requestId);
        }

        // GET /api/roles-metadata/validate/{roleName}
        if (httpMethod === 'GET' && path.includes('/roles-metadata/validate/')) {
            const roleName = path.split('/').pop();
            if (!roleName) return errorResponse(400, 'Role name required', requestId);

            const role = await prisma.roles.findUnique({
                where: { name: roleName },
                select: { id: true, name: true, display_name: true, is_active: true }
            });

            if (!role) {
                return errorResponse(404, 'Role not found', requestId);
            }

            return successResponse({
                success: true,
                valid: role.is_active || false,
                role
            }, 'Role validation', requestId);
        }

        // ============================================================================
        // PROTECTED ENDPOINTS (Auth Required)
        // ============================================================================

        let user: AuthenticatedUser;
        try {
            user = await authenticate(event, prisma);
        } catch (error: any) {
            return errorResponse(401, error.message, requestId);
        }

        // GET /api/roles-metadata/me (Legacy Endpoint)
        if (httpMethod === 'GET' && path.endsWith('/roles-metadata/me')) {
            // Get user roles with details similar to legacy controller
            const userRoles = await rbacService.getUserRBAC(user.id);
            const primaryRole = userRoles.roles.find(r => r.isPrimary) || userRoles.roles[0];

            return successResponse({
                success: true,
                roles: userRoles.roles,
                primaryRole: primaryRole,
                legacyRole: user.role
            }, 'User roles retrieved', requestId);
        }

        // GET /api/roles (Private - Admin)
        // GET /api/rbac/roles (New Standard)
        if (httpMethod === 'GET' && (path.endsWith('/api/roles') || path.endsWith('/rbac/roles'))) {
            if (!hasPermission(user, 'roles.read') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }
            const roles = await rbacService.getAllRoles();
            return successResponse({ roles }, 'All roles retrieved', requestId);
        }

        // GET /api/rbac/permissions
        if (httpMethod === 'GET' && path.endsWith('/permissions')) {
            if (!hasPermission(user, 'permissions.read') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }
            const permissions = await prisma.permissions.findMany({ orderBy: { resource: 'asc' } });
            return successResponse({ permissions }, 'Permissions retrieved', requestId);
        }

        // GET /api/roles/user/{userId}
        // GET /api/rbac/users/{userId}/roles
        if (httpMethod === 'GET' && (path.includes('/roles/user/') || (path.includes('/users/') && path.endsWith('/roles')))) {
            if (!hasPermission(user, 'users.read') && !hasPermission(user, 'admin.access')) {
                // Check self
                const idFromPath = extractId(path);
                if (idFromPath !== user.id.toString()) return errorResponse(403, 'Permission denied', requestId);
            }
            const targetId = BigInt(extractId(path) || '0');
            const rbac = await rbacService.getUserRBAC(targetId);
            return successResponse({ roles: rbac.roles }, 'User roles retrieved', requestId);
        }

        // POST /api/roles/assign (Legacy)
        // POST /api/rbac/users/{userId}/roles (New)
        if (httpMethod === 'POST' && (path.endsWith('/roles/assign') || (path.includes('/users/') && path.endsWith('/roles')))) {
            if (!hasPermission(user, 'roles.assign') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }

            let targetUserId: bigint;
            let roleName: string;
            let isPrimary = false;

            const bodyData = JSON.parse(body || '{}');

            if (path.endsWith('/roles/assign')) {
                // Legacy Body: { userId, roleName, isPrimary }
                targetUserId = BigInt(bodyData.userId);
                roleName = bodyData.roleName;
                isPrimary = bodyData.isPrimary;
            } else {
                // New param style
                targetUserId = BigInt(extractId(path) || '0');
                roleName = bodyData.roleName;
                isPrimary = bodyData.isPrimary;
            }

            if (!roleName) return errorResponse(400, 'roleName required', requestId);

            await rbacService.assignRole(targetUserId, roleName, user.id, isPrimary || false); // fixed arg order

            logger.info('Role assigned', { admin: user.id.toString(), target: targetUserId.toString(), role: roleName });
            return successResponse({ success: true }, `Role ${roleName} assigned`, requestId);
        }

        // POST /api/roles/remove (Legacy)
        // DELETE /api/rbac/users/{userId}/roles (New)
        if ((httpMethod === 'POST' && path.endsWith('/roles/remove')) || (httpMethod === 'DELETE' && path.includes('/users/') && path.endsWith('/roles'))) {
            if (!hasPermission(user, 'roles.revoke') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }

            let targetUserId: bigint;
            let roleName: string;

            if (path.endsWith('/roles/remove')) {
                const bodyData = JSON.parse(body || '{}');
                targetUserId = BigInt(bodyData.userId);
                roleName = bodyData.roleName;
            } else {
                targetUserId = BigInt(extractId(path) || '0');
                const bodyData = JSON.parse(body || '{}');
                roleName = bodyData.roleName; // or query param
            }

            if (!roleName) return errorResponse(400, 'roleName required', requestId);

            await rbacService.revokeRole(targetUserId, roleName, user.id);

            return successResponse({ success: true }, `Role ${roleName} revoked`, requestId);
        }


        return errorResponse(404, 'Route not found', requestId);

    } catch (error: any) {
        logger.error('RBAC Handler Error', { error: error.message, stack: error.stack });
        return errorResponse(500, error.message || 'Internal Server Error', requestId);
    }
};

function extractId(path: string): string | null {
    // Try to find numeric ID or ID after /user/
    const parts = path.split('/');
    // Check for /roles/user/123
    const userIdx = parts.indexOf('user');
    if (userIdx !== -1 && userIdx + 1 < parts.length) return parts[userIdx + 1];

    // Check for /users/123/roles
    const usersIdx = parts.indexOf('users');
    if (usersIdx !== -1 && usersIdx + 1 < parts.length) return parts[usersIdx + 1];

    // Check validate/{roleName}
    const validateIdx = parts.indexOf('validate');
    if (validateIdx !== -1 && validateIdx + 1 < parts.length) return parts[validateIdx + 1];

    return null;
}
