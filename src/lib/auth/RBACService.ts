/**
 * RBAC Service
 * 
 * Handles Role-Based Access Control operations:
 * - Load user roles and permissions
 * - Check permissions
 * - Manage role assignments
 */

import { PrismaClient } from '@prisma/client';

export interface Role {
    id: number;
    name: string;
    displayName: string;
    isPrimary: boolean;
}

export interface Permission {
    name: string;
    resource: string;
    action: string;
    description?: string;
}

export interface UserRBAC {
    roles: Role[];
    permissions: Permission[];
}

export class RBACService {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    /**
     * Load all roles and permissions for a user
     */
    async getUserRBAC(userId: bigint): Promise<UserRBAC> {
        // Get user roles
        const userRoles = await this.prisma.user_roles.findMany({
            where: {
                user_id: userId,
                OR: [
                    { expires_at: null },
                    { expires_at: { gt: new Date() } }
                ]
            },
            include: {
                roles: {
                    include: {
                        role_permissions: {
                            include: {
                                permissions: true
                            }
                        }
                    }
                }
            }
        });

        // Transform to Role objects
        const roles: Role[] = userRoles.map(ur => ({
            id: ur.roles.id,
            name: ur.roles.name,
            displayName: ur.roles.display_name,
            isPrimary: ur.is_primary || false
        }));

        // Collect all unique permissions from all roles
        const permissionMap = new Map<string, Permission>();

        for (const userRole of userRoles) {
            for (const rolePermission of userRole.roles.role_permissions) {
                const perm = rolePermission.permissions;
                if (!permissionMap.has(perm.name)) {
                    permissionMap.set(perm.name, {
                        name: perm.name,
                        resource: perm.resource,
                        action: perm.action,
                        description: perm.description || undefined
                    });
                }
            }
        }

        const permissions = Array.from(permissionMap.values());

        return { roles, permissions };
    }

    /**
     * Check if user has a specific permission
     */
    async hasPermission(userId: bigint, permissionName: string): Promise<boolean> {
        const result = await this.prisma.$queryRaw<Array<{ has_permission: boolean }>>`
            SELECT user_has_permission(${userId}, ${permissionName}) as has_permission
        `;

        return result[0]?.has_permission || false;
    }

    /**
     * Check if user has a specific role
     */
    async hasRole(userId: bigint, roleName: string): Promise<boolean> {
        const userRole = await this.prisma.user_roles.findFirst({
            where: {
                user_id: userId,
                roles: {
                    name: roleName
                },
                OR: [
                    { expires_at: null },
                    { expires_at: { gt: new Date() } }
                ]
            }
        });

        return !!userRole;
    }

    /**
     * Assign a role to a user
     */
    async assignRole(
        userId: bigint,
        roleName: string,
        assignedBy?: bigint,
        isPrimary: boolean = false,
        expiresAt?: Date
    ): Promise<void> {
        // Get role ID
        const role = await this.prisma.roles.findUnique({
            where: { name: roleName }
        });

        if (!role) {
            throw new Error(`Role not found: ${roleName}`);
        }

        // If setting as primary, unset other primary roles
        if (isPrimary) {
            await this.prisma.user_roles.updateMany({
                where: {
                    user_id: userId,
                    is_primary: true
                },
                data: {
                    is_primary: false
                }
            });
        }

        // Assign role
        await this.prisma.user_roles.upsert({
            where: {
                user_id_role_id: {
                    user_id: userId,
                    role_id: role.id
                }
            },
            create: {
                user_id: userId,
                role_id: role.id,
                is_primary: isPrimary,
                assigned_by: assignedBy,
                expires_at: expiresAt
            },
            update: {
                is_primary: isPrimary,
                expires_at: expiresAt
            }
        });

        // Audit log
        await this.prisma.role_change_audit.create({
            data: {
                user_id: userId,
                role_id: role.id,
                action: 'granted',
                changed_by: assignedBy,
                reason: isPrimary ? 'Primary role assignment' : 'Role assignment'
            }
        });
    }

    /**
     * Revoke a role from a user
     */
    async revokeRole(
        userId: bigint,
        roleName: string,
        revokedBy?: bigint,
        reason?: string
    ): Promise<void> {
        // Get role ID
        const role = await this.prisma.roles.findUnique({
            where: { name: roleName }
        });

        if (!role) {
            throw new Error(`Role not found: ${roleName}`);
        }

        // Remove role
        await this.prisma.user_roles.delete({
            where: {
                user_id_role_id: {
                    user_id: userId,
                    role_id: role.id
                }
            }
        });

        // Audit log
        await this.prisma.role_change_audit.create({
            data: {
                user_id: userId,
                role_id: role.id,
                action: 'revoked',
                changed_by: revokedBy,
                reason: reason || 'Role revoked'
            }
        });
    }

    /**
     * Get all available roles
     */
    async getAllRoles(): Promise<Array<{ id: number; name: string; displayName: string; description: string | null }>> {
        const roles = await this.prisma.roles.findMany({
            orderBy: { name: 'asc' }
        });

        return roles.map(r => ({
            id: r.id,
            name: r.name,
            displayName: r.display_name,
            description: r.description
        }));
    }

    /**
     * Get all permissions for a role
     */
    async getRolePermissions(roleName: string): Promise<Permission[]> {
        const role = await this.prisma.roles.findUnique({
            where: { name: roleName },
            include: {
                role_permissions: {
                    include: {
                        permissions: true
                    }
                }
            }
        });

        if (!role) {
            return [];
        }

        return role.role_permissions.map(rp => ({
            name: rp.permissions.name,
            resource: rp.permissions.resource,
            action: rp.permissions.action,
            description: rp.permissions.description || undefined
        }));
    }
}
