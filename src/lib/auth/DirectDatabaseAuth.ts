/**
 * Direct Database Authentication
 * 
 * Handles authentication for users created directly in the database
 * (like super admin) who don't have Firebase/Cognito accounts
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('direct-db-auth');

export interface DirectAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
}

export interface DirectAuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface DirectAuthResponse {
  user: DirectAuthUser;
  tokens: DirectAuthTokens;
}

export class DirectDatabaseAuth {
  constructor(
    private prisma: PrismaClient,
    private jwtSecret: string
  ) {}

  /**
   * Authenticate user directly against database
   * ONLY allowed for super_admin users
   */
  async authenticateUser(email: string, password: string): Promise<DirectAuthResponse> {
    try {
      // Find user in database
      const user = await this.prisma.users.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          password_hash: true,
          account_status: true,
          is_verified: true,
          email_verified: true,
          current_auth_provider: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // SECURITY: Only super_admin users can use direct database authentication
      if (user.role !== 'super_admin') {
        throw new Error('Direct database authentication only allowed for super admin');
      }

      if (user.account_status !== 'active') {
        throw new Error(`Account is ${user.account_status}`);
      }

      if (!user.password_hash) {
        throw new Error('No password set for this user');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid password');
      }

      // Generate tokens
      const tokens = this.generateTokens(user);

      logger.info('Direct database authentication successful for super admin', {
        userId: user.id.toString(),
        email: user.email,
        role: user.role
      });

      return {
        user: {
          id: user.id.toString(),
          email: user.email,
          firstName: user.first_name || 'User',
          lastName: user.last_name || 'User',
          role: user.role,
          emailVerified: user.email_verified || false
        },
        tokens
      };

    } catch (error) {
      logger.error('Direct database authentication failed', {
        email,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Generate JWT tokens for direct database user
   */
  private generateTokens(user: any): DirectAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour
    const expiresAt = now + expiresIn;

    const payload = {
      sub: user.id.toString(),
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
      email_verified: user.email_verified,
      iat: now,
      exp: expiresAt,
      iss: 'ataraxia-direct-auth',
      aud: 'ataraxia-app'
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256'
    });

    return {
      accessToken: token,
      idToken: token,
      refreshToken: token, // For simplicity, using same token
      expiresIn
    };
  }

  /**
   * Verify JWT token for direct database user
   */
  async verifyToken(token: string): Promise<DirectAuthUser> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      // Verify user still exists and is active
      const user = await this.prisma.users.findUnique({
        where: { id: parseInt(decoded.sub) },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          account_status: true,
          email_verified: true
        }
      });

      if (!user || user.account_status !== 'active') {
        throw new Error('User not found or inactive');
      }

      return {
        id: user.id.toString(),
        email: user.email,
        firstName: user.first_name || 'User',
        lastName: user.last_name || 'User',
        role: user.role,
        emailVerified: user.email_verified || false
      };

    } catch (error) {
      logger.error('Token verification failed', {
        error: (error as Error).message
      });
      throw new Error('Invalid token');
    }
  }

  /**
   * Check if user should use direct database authentication
   * ONLY allowed for super_admin users with 'local' provider mapping
   */
  async shouldUseDirectAuth(email: string): Promise<boolean> {
    try {
      const user = await this.prisma.users.findUnique({
        where: { email },
        select: {
          role: true,
          password_hash: true,
          current_auth_provider: true
        }
      });

      // SECURITY: Only super_admin users can use direct database authentication
      if (!user || user.role !== 'super_admin') {
        return false;
      }

      // Check if super admin has password hash and 'local' as current provider
      if (user.password_hash && user.current_auth_provider === 'local') {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Direct auth check failed', {
        email,
        error: (error as Error).message
      });
      return false;
    }
  }
}