/**
 * User Management Lambda
 * 
 * Handles user searching, listing, and detail retrieval.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { RBACService } from '../../lib/auth/RBACService';
import { verifyJWT } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse } from '../../shared/response';

const logger = createLogger('users-service');

interface AuthenticatedUser {
    id: bigint;
    email: string;
    role: string;
    roles: Array<{ id: number; name: string; isPrimary: boolean }>;
    permissions: Array<{ name: string; resource: string; action: string }>;
}

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

    const rbacService = new RBACService(prisma);
    const rbacData = await rbacService.getUserRBAC(userId);

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
    const { httpMethod, path, queryStringParameters } = event;
    const prisma = getPrisma();

    logger.info('Users Request', { requestId, httpMethod, path });

    try {
        // 1. Authenticate
        let user: AuthenticatedUser;
        try {
            user = await authenticate(event, prisma);
        } catch (error: any) {
            return errorResponse(401, error.message, requestId);
        }

        // 2. Route

        // GET /api/users (List/Search)
        if (httpMethod === 'GET' && path.endsWith('/users')) {
            if (!hasPermission(user, 'users.read') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }

            const page = parseInt(queryStringParameters?.page || '1');
            const limit = parseInt(queryStringParameters?.limit || '20');
            const search = queryStringParameters?.q || '';
            const roleFilter = queryStringParameters?.role || ''; // filter by role name

            const whereClause: any = {};
            if (search) {
                whereClause.OR = [
                    { email: { contains: search, mode: 'insensitive' } },
                    { first_name: { contains: search, mode: 'insensitive' } },
                    { last_name: { contains: search, mode: 'insensitive' } }
                ];
            }
            if (roleFilter) {
                whereClause.role = roleFilter;
            }

            const total = await prisma.users.count({ where: whereClause });
            const users = await prisma.users.findMany({
                where: whereClause,
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    role: true, // legacy / primary role
                    account_status: true,
                    created_at: true,
                    last_login_at: true
                },
                orderBy: { created_at: 'desc' }
            });

            // Need to convert BigInt to string for JSON serialization
            const safeUsers = users.map(u => ({
                ...u,
                id: u.id.toString(),
            }));

            return successResponse({
                users: safeUsers,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }, 'Users retrieved', requestId);
        }

        // GET /api/users/{id}
        if (httpMethod === 'GET' && path.includes('/users/')) {
            // Permission check: admin or self
            const targetIdStr = path.split('/').pop();
            if (!targetIdStr) return errorResponse(400, 'Invalid user ID', requestId);

            const targetId = BigInt(targetIdStr);
            const isSelf = user.id === targetId;

            if (!isSelf && !hasPermission(user, 'users.read') && !hasPermission(user, 'admin.access')) {
                return errorResponse(403, 'Permission denied', requestId);
            }

            const targetUser = await prisma.users.findUnique({
                where: { id: targetId },
                include: {
                    user_roles_user_roles_user_idTousers: {
                        include: { roles: true }
                    }
                }
            });

            if (!targetUser) return errorResponse(404, 'User not found', requestId);

            return successResponse({
                user: {
                    ...targetUser,
                    id: targetUser.id.toString(),
                    user_roles: targetUser.user_roles_user_roles_user_idTousers.map(ur => ({
                        ...ur,
                        role_id: ur.role_id,
                        user_id: ur.user_id.toString(),
                        assigned_by: ur.assigned_by ? ur.assigned_by.toString() : null
                    }))
                }
            }, 'User details retrieved', requestId);
        }

        return errorResponse(404, 'Route not found', requestId);

    } catch (error: any) {
        logger.error('Users Handler Error', { error: error.message });
        return errorResponse(500, 'Internal Server Error', requestId);
    }
};
