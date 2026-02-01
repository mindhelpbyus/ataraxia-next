/**
 * Authentication & Authorization Middleware
 * 
 * Provides middleware functions for:
 * - JWT token verification
 * - User authentication
 * - Permission-based authorization
 * - Role-based authorization
 */

import { Request, Response, NextFunction } from 'express';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { RBACService } from './RBACService';
import { verifyJWT } from '../../shared/auth';
import { createLogger } from '../../shared/logger';

const logger = createLogger('auth-middleware');

// Extend Express Request to include user data
export interface AuthenticatedRequest extends Request {
    user?: {
        id: bigint;
        email: string;
        role: string;
        roles: Array<{ id: number; name: string; displayName: string; isPrimary: boolean }>;
        permissions: Array<{ name: string; resource: string; action: string }>;
    };
    requestId?: string;
}

/**
 * Extract token from Authorization header or query parameter
 */
function extractToken(req: Request | APIGatewayProxyEvent): string | null {
    // Express Request
    if ('headers' in req && typeof req.headers === 'object') {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check query parameter
        if ('query' in req && req.query && typeof req.query.token === 'string') {
            return req.query.token;
        }
    }

    // API Gateway Event
    if ('queryStringParameters' in req && req.queryStringParameters) {
        const authHeader = req.headers?.Authorization || req.headers?.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check query string
        if (req.queryStringParameters.token) {
            return req.queryStringParameters.token;
        }
    }

    return null;
}

/**
 * Authenticate middleware - Verifies JWT and loads user data
 * 
 * Usage:
 *   router.get('/api/protected', authenticate, handler);
 */
export function authenticate(prisma: PrismaClient) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const requestId = req.headers['x-request-id'] as string || Math.random().toString(36);
        req.requestId = requestId;

        try {
            // Extract token
            const token = extractToken(req);
            if (!token) {
                logger.warn('No token provided', { requestId, path: req.path });
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'No authentication token provided',
                    requestId
                });
            }

            // Verify JWT
            const authResult = await verifyJWT(`Bearer ${token}`);

            if (!authResult.success || !authResult.user) {
                logger.warn('Invalid token', { requestId, error: authResult.error });
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: authResult.error || 'Invalid or expired token',
                    requestId
                });
            }

            // Extract user ID from token
            const userId = BigInt(authResult.user.id);

            // Load user from database
            const user = await prisma.users.findUnique({
                where: { id: userId }
            });

            if (!user) {
                logger.warn('User not found', { requestId, userId: userId.toString() });
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'User not found',
                    requestId
                });
            }

            // Check if user is active
            if (user.account_status !== 'active') {
                logger.warn('Inactive user', { requestId, userId: userId.toString(), status: user.account_status });
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Account is not active',
                    requestId
                });
            }

            // Load RBAC data
            const rbacService = new RBACService(prisma);
            const rbacData = await rbacService.getUserRBAC(userId);

            // Attach user to request
            req.user = {
                id: user.id,
                email: user.email,
                role: user.role,
                roles: rbacData.roles,
                permissions: rbacData.permissions
            };

            logger.info('User authenticated', {
                requestId,
                userId: userId.toString(),
                email: user.email,
                rolesCount: rbacData.roles.length,
                permissionsCount: rbacData.permissions.length
            });

            next();

        } catch (error) {
            logger.error('Authentication error', { requestId, error });
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Authentication failed',
                requestId
            });
        }
    };
}

/**
 * Require permission middleware - Checks if user has specific permission
 * 
 * Usage:
 *   router.post('/api/clients', authenticate, requirePermission('clients.create'), handler);
 */
export function requirePermission(permissionName: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const requestId = req.requestId || Math.random().toString(36);

        if (!req.user) {
            logger.warn('No user in request', { requestId, permission: permissionName });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
                requestId
            });
        }

        // Check if user has permission
        const hasPermission = req.user.permissions.some(p => p.name === permissionName);

        if (!hasPermission) {
            logger.warn('Permission denied', {
                requestId,
                userId: req.user.id.toString(),
                permission: permissionName,
                userPermissions: req.user.permissions.map(p => p.name)
            });

            return res.status(403).json({
                error: 'Forbidden',
                message: `Permission denied: ${permissionName}`,
                requestId
            });
        }

        logger.info('Permission granted', {
            requestId,
            userId: req.user.id.toString(),
            permission: permissionName
        });

        next();
    };
}

/**
 * Require role middleware - Checks if user has specific role
 * 
 * Usage:
 *   router.get('/api/admin', authenticate, requireRole('admin'), handler);
 */
export function requireRole(roleName: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const requestId = req.requestId || Math.random().toString(36);

        if (!req.user) {
            logger.warn('No user in request', { requestId, role: roleName });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
                requestId
            });
        }

        // Check if user has role
        const hasRole = req.user.roles.some(r => r.name === roleName);

        if (!hasRole) {
            logger.warn('Role denied', {
                requestId,
                userId: req.user.id.toString(),
                requiredRole: roleName,
                userRoles: req.user.roles.map(r => r.name)
            });

            return res.status(403).json({
                error: 'Forbidden',
                message: `Role required: ${roleName}`,
                requestId
            });
        }

        logger.info('Role granted', {
            requestId,
            userId: req.user.id.toString(),
            role: roleName
        });

        next();
    };
}

/**
 * Require any permission middleware - Checks if user has ANY of the specified permissions
 * 
 * Usage:
 *   router.get('/api/data', authenticate, requireAnyPermission(['data.read', 'admin.access']), handler);
 */
export function requireAnyPermission(permissionNames: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const requestId = req.requestId || Math.random().toString(36);

        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
                requestId
            });
        }

        // Check if user has any of the permissions
        const hasAnyPermission = permissionNames.some(permName =>
            req.user!.permissions.some(p => p.name === permName)
        );

        if (!hasAnyPermission) {
            logger.warn('No matching permissions', {
                requestId,
                userId: req.user.id.toString(),
                requiredPermissions: permissionNames,
                userPermissions: req.user.permissions.map(p => p.name)
            });

            return res.status(403).json({
                error: 'Forbidden',
                message: `One of these permissions required: ${permissionNames.join(', ')}`,
                requestId
            });
        }

        next();
    };
}

/**
 * Require all permissions middleware - Checks if user has ALL of the specified permissions
 * 
 * Usage:
 *   router.post('/api/sensitive', authenticate, requireAllPermissions(['data.read', 'data.write']), handler);
 */
export function requireAllPermissions(permissionNames: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const requestId = req.requestId || Math.random().toString(36);

        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
                requestId
            });
        }

        // Check if user has all permissions
        const missingPermissions = permissionNames.filter(permName =>
            !req.user!.permissions.some(p => p.name === permName)
        );

        if (missingPermissions.length > 0) {
            logger.warn('Missing permissions', {
                requestId,
                userId: req.user.id.toString(),
                missingPermissions,
                userPermissions: req.user.permissions.map(p => p.name)
            });

            return res.status(403).json({
                error: 'Forbidden',
                message: `Missing permissions: ${missingPermissions.join(', ')}`,
                requestId
            });
        }

        next();
    };
}

/**
 * Optional authentication - Loads user if token is provided, but doesn't require it
 * 
 * Usage:
 *   router.get('/api/public', optionalAuth, handler);
 */
export function optionalAuth(prisma: PrismaClient) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const token = extractToken(req);

        if (!token) {
            // No token, continue without user
            return next();
        }

        try {
            const authResult = await verifyJWT(`Bearer ${token}`);

            if (authResult.success && authResult.user) {
                const userId = BigInt(authResult.user.id);

                const user = await prisma.users.findUnique({
                    where: { id: userId }
                });

                if (user && user.account_status === 'active') {
                    const rbacService = new RBACService(prisma);
                    const rbacData = await rbacService.getUserRBAC(userId);

                    req.user = {
                        id: user.id,
                        email: user.email,
                        role: user.role,
                        roles: rbacData.roles,
                        permissions: rbacData.permissions
                    };
                }
            }
        } catch (error) {
            // Invalid token, continue without user
            logger.debug('Optional auth failed', { error });
        }

        next();
    };
}
