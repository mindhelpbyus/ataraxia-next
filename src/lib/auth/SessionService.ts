/**
 * Session Service - Simplified for current schema
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('session-service');

export interface SessionInfo {
  sessionId: string;
  userId: bigint;
  deviceInfo: any;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  isActive: boolean;
  rememberMe: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
}

export class SessionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create new session
   */

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      const session = await this.prisma.user_sessions.findUnique({
        where: { session_id: sessionId }
      });

      if (!session || !session.is_active || session.expires_at < new Date()) {
        return null;
      }

      // Update last accessed time
      await this.prisma.user_sessions.update({
        where: { session_id: sessionId },
        data: { last_accessed_at: new Date() }
      });

      return {
        sessionId: session.session_id,
        userId: session.user_id,
        deviceInfo: session.device_info,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        expiresAt: session.expires_at,
        isActive: session.is_active || false,
        rememberMe: session.remember_me || false,
        createdAt: session.created_at || new Date(),
        lastAccessedAt: session.last_accessed_at || new Date()
      };

    } catch (error: any) {
      logger.error('Failed to get session', { sessionId, error: error.message });
      return null;
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.user_sessions.updateMany({
        where: { session_id: sessionId },
        data: {
          is_active: false,
          ended_at: new Date(),
          end_reason: 'logout'
        }
      });

      logger.info('Session invalidated', { sessionId, success: result.count > 0 });
      return result.count > 0;

    } catch (error: any) {
      logger.error('Failed to invalidate session', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Invalidate all user sessions except current
   */
  async invalidateAllUserSessions(userId: bigint, exceptSessionId?: string): Promise<number> {
    try {
      const whereClause: any = {
        user_id: userId,
        is_active: true
      };

      if (exceptSessionId) {
        whereClause.session_id = { not: exceptSessionId };
      }

      const result = await this.prisma.user_sessions.updateMany({
        where: whereClause,
        data: {
          is_active: false,
          ended_at: new Date(),
          end_reason: 'force_logout'
        }
      });

      logger.info('All user sessions invalidated', { userId: userId.toString(), count: result.count, exceptSessionId });
      return result.count;

    } catch (error: any) {
      logger.error('Failed to invalidate all user sessions', { userId: userId.toString(), error: error.message });
      return 0;
    }
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: bigint): Promise<SessionInfo[]> {
    try {
      const sessions = await this.prisma.user_sessions.findMany({
        where: {
          user_id: userId,
          is_active: true,
          expires_at: { gt: new Date() }
        },
        orderBy: { last_accessed_at: 'desc' }
      });

      return sessions.map(session => ({
        sessionId: session.session_id,
        userId: session.user_id,
        deviceInfo: session.device_info,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        expiresAt: session.expires_at,
        isActive: session.is_active || false,
        rememberMe: session.remember_me || false,
        createdAt: session.created_at || new Date(),
        lastAccessedAt: session.last_accessed_at || new Date()
      }));

    } catch (error: any) {
      logger.error('Failed to get active sessions', { userId: userId.toString(), error: error.message });
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.prisma.user_sessions.deleteMany({
        where: {
          OR: [
            { expires_at: { lt: new Date() } },
            { is_active: false, ended_at: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // 7 days old
          ]
        }
      });

      logger.info('Expired sessions cleaned up', { count: result.count });
      return result.count;

    } catch (error: any) {
      logger.error('Failed to cleanup expired sessions', { error: error.message });
      return 0;
    }
  }

  // Helper methods
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create session with device info object
   */

  /**
   * Get user active sessions (alias for getActiveSessions)
   */
  async getUserActiveSessions(userId: bigint, currentSessionId?: string): Promise<SessionInfo[]> {
    return this.getActiveSessions(userId);
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(userId: bigint, days: number = 30): Promise<any> {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const sessions = await this.prisma.user_sessions.findMany({
        where: {
          user_id: userId,
          created_at: { gte: since }
        }
      });

      const totalSessions = sessions.length;
      const activeSessions = sessions.filter(s => s.is_active).length;
      const uniqueDevices = new Set(sessions.map(s => (s.device_info as any)?.deviceId || 'unknown')).size;
      const uniqueIPs = new Set(sessions.map(s => s.ip_address)).size;

      return {
        totalSessions,
        activeSessions,
        uniqueDevices,
        uniqueIPs,
        averageSessionDuration: this.calculateAverageSessionDuration(sessions)
      };

    } catch (error: any) {
      logger.error('Failed to get session analytics', { userId: userId.toString(), error: error.message });
      return {
        totalSessions: 0,
        activeSessions: 0,
        uniqueDevices: 0,
        uniqueIPs: 0,
        averageSessionDuration: 0
      };
    }
  }

  private calculateAverageSessionDuration(sessions: any[]): number {
    const completedSessions = sessions.filter(s => s.ended_at);
    if (completedSessions.length === 0) return 0;

    const totalDuration = completedSessions.reduce((sum, session) => {
      const duration = session.ended_at.getTime() - session.created_at.getTime();
      return sum + duration;
    }, 0);

    return Math.round(totalDuration / completedSessions.length / 1000 / 60); // minutes
  }
}

export default SessionService;