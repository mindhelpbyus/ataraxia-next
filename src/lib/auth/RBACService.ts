/**
 * RBAC Service
 * 
 * Handles Role-Based Access Control operations:
 * - Load user roles and permissions
 * - Check permissions
 * - Manage role assignments
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('rbac-service');

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
    try {
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

      logger.info('User RBAC loaded', { userId: userId.toString(), roleCount: roles.length, permissionCount: permissions.length });

      return { roles, permissions };

    } catch (error: any) {
      logger.error('Failed to load user RBAC', { userId: userId.toString(), error: error.message });
      return { roles: [], permissions: [] };
    }
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: bigint, permissionName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ has_permission: boolean }>>`
        SELECT user_has_permission(${userId}, ${permissionName}) as has_permission
      `;

      const hasPermission = result[0]?.has_permission || false;
      
      logger.debug('Permission check', { userId: userId.toString(), permissionName, hasPermission });
      
      return hasPermission;

    } catch (error: any) {
      logger.error('Permission check failed', { userId: userId.toString(), permissionName, error: error.message });
      return false;
    }
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(userId: bigint, permissions: string[]): Promise<boolean> {
    try {
      for (const permission of permissions) {
        if (await this.hasPermission(userId, permission)) {
          return true;
        }
      }
      return false;

    } catch (error: any) {
      logger.error('Any permission check failed', { userId: userId.toString(), permissions, error: error.message });
      return false;
    }
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(userId: bigint, permissions: string[]): Promise<boolean> {
    try {
      for (const permission of permissions) {
        if (!(await this.hasPermission(userId, permission))) {
          return false;
        }
      }
      return true;

    } catch (error: any) {
      logger.error('All permissions check failed', { userId: userId.toString(), permissions, error: error.message });
      return false;
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: bigint, roleId: number, assignedBy?: bigint, isPrimary: boolean = false): Promise<boolean> {
    try {
      await this.prisma.user_roles.upsert({
        where: {
          user_id_role_id: {
            user_id: userId,
            role_id: roleId
          }
        },
        update: {
          is_primary: isPrimary,
          assigned_by: assignedBy,
          // updated_at removed - not in schema
        },
        create: {
          user_id: userId,
          role_id: roleId,
          is_primary: isPrimary,
          assigned_by: assignedBy
        }
      });

      // Log audit trail
      if (assignedBy) {
        await this.prisma.role_change_audit.create({
          data: {
            user_id: userId,
            role_id: roleId,
            action: 'assigned',
            changed_by: assignedBy
          }
        });
      }

      logger.info('Role assigned', { userId: userId.toString(), roleId, assignedBy, isPrimary });
      return true;

    } catch (error: any) {
      logger.error('Role assignment failed', { userId: userId.toString(), roleId, error: error.message });
      return false;
    }
  }

  /**
   * Revoke role from user
   */
  async revokeRole(userId: bigint, roleId: number, revokedBy?: bigint): Promise<boolean> {
    try {
      await this.prisma.user_roles.delete({
        where: {
          user_id_role_id: {
            user_id: userId,
            role_id: roleId
          }
        }
      });

      // Log audit trail
      if (revokedBy) {
        await this.prisma.role_change_audit.create({
          data: {
            user_id: userId,
            role_id: roleId,
            action: 'revoked',
            changed_by: revokedBy
          }
        });
      }

      logger.info('Role revoked', { userId: userId.toString(), roleId, revokedBy });
      return true;

    } catch (error: any) {
      logger.error('Role revocation failed', { userId: userId.toString(), roleId, error: error.message });
      return false;
    }
  }

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<Role[]> {
    try {
      const roles = await this.prisma.roles.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' }
      });

      return roles.map(role => ({
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        isPrimary: false // This would be determined per user
      }));

    } catch (error: any) {
      logger.error('Failed to get all roles', { error: error.message });
      return [];
    }
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    try {
      const permissions = await this.prisma.permissions.findMany({
        orderBy: [{ resource: 'asc' }, { action: 'asc' }]
      });

      return permissions.map(perm => ({
        name: perm.name,
        resource: perm.resource,
        action: perm.action,
        description: perm.description || undefined
      }));

    } catch (error: any) {
      logger.error('Failed to get all permissions', { error: error.message });
      return [];
    }
  }

  /**
   * Get users with specific role
   */
  async getUsersWithRole(roleId: number): Promise<Array<{ userId: bigint; isPrimary: boolean; assignedAt: Date }>> {
    try {
      const userRoles = await this.prisma.user_roles.findMany({
        where: { role_id: roleId },
        select: {
          user_id: true,
          is_primary: true,
          assigned_at: true
        }
      });

      return userRoles.map(ur => ({
        userId: ur.user_id,
        isPrimary: ur.is_primary || false,
        assignedAt: ur.assigned_at || new Date()
      }));

    } catch (error: any) {
      logger.error('Failed to get users with role', { roleId, error: error.message });
      return [];
    }
  }

  /**
   * Get role ID from role name
   */
  async getRoleIdByName(roleName: string): Promise<number | null> {
    try {
      const role = await this.prisma.roles.findUnique({
        where: { name: roleName },
        select: { id: true }
      });
      return role?.id || null;
    } catch (error: any) {
      logger.error('Failed to get role ID by name', { roleName, error: error.message });
      return null;
    }
  }
}