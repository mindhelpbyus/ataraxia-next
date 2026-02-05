/**
 * Security Service - Simplified for current schema
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('security-service');

export class SecurityService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(email: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      await this.prisma.security_events.create({
        data: {
          identifier: email,
          action: 'failed_login',
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { email, timestamp: new Date() }
        }
      });

      logger.info('Failed login recorded', { email, ipAddress });

    } catch (error: any) {
      logger.error('Failed to record failed login', { email, error: error.message });
    }
  }

  /**
   * Record successful login
   */
  async recordSuccessfulLogin(userId: bigint, email: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      await this.prisma.security_events.create({
        data: {
          identifier: userId.toString(),
          action: 'successful_login',
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { email, userId: userId.toString(), timestamp: new Date() }
        }
      });

      logger.info('Successful login recorded', { userId: userId.toString(), email, ipAddress });

    } catch (error: any) {
      logger.error('Failed to record successful login', { userId: userId.toString(), email, error: error.message });
    }
  }

  /**
   * Create device fingerprint
   */
  async createDeviceFingerprint(userId: bigint, deviceId: string, userAgent: string, ipAddress: string): Promise<void> {
    try {
      const deviceHash = this.generateDeviceHash(deviceId, userAgent);

      await this.prisma.user_devices.upsert({
        where: { 
          user_id_device_hash: {
            user_id: userId,
            device_hash: deviceHash
          }
        },
        update: {
          last_seen_at: new Date(),
          ip_address: ipAddress
        },
        create: {
          user_id: userId,
          device_hash: deviceHash,
          device_id: deviceId,
          user_agent: userAgent,
          ip_address: ipAddress,
          device_info: { deviceId, userAgent },
          is_trusted: false
        }
      });

      logger.info('Device fingerprint created', { userId: userId.toString(), deviceId });

    } catch (error: any) {
      logger.error('Failed to create device fingerprint', { userId: userId.toString(), error: error.message });
    }
  }

  /**
   * Trust device
   */
  async trustDevice(userId: bigint, deviceId: string): Promise<boolean> {
    try {
      const deviceHash = this.generateDeviceHash(deviceId, '');

      const result = await this.prisma.user_devices.updateMany({
        where: {
          user_id: userId,
          device_id: deviceId
        },
        data: {
          is_trusted: true,
          trusted_at: new Date()
        }
      });

      const success = result.count > 0;
      logger.info('Device trust updated', { userId: userId.toString(), deviceId, success });
      return success;

    } catch (error: any) {
      logger.error('Failed to trust device', { userId: userId.toString(), deviceId, error: error.message });
      return false;
    }
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(userId: bigint, deviceId: string): Promise<boolean> {
    try {
      const device = await this.prisma.user_devices.findFirst({
        where: {
          user_id: userId,
          device_id: deviceId,
          is_trusted: true
        }
      });

      return !!device;

    } catch (error: any) {
      logger.error('Failed to check device trust', { userId: userId.toString(), deviceId, error: error.message });
      return false;
    }
  }

  /**
   * Get failed login count
   */
  async getFailedLoginCount(email: string, timeWindow: number = 15): Promise<number> {
    try {
      const since = new Date(Date.now() - timeWindow * 60 * 1000);
      
      return await this.prisma.security_events.count({
        where: {
          identifier: email,
          action: 'failed_login',
          created_at: { gte: since }
        }
      });

    } catch (error: any) {
      logger.error('Failed to get failed login count', { email, error: error.message });
      return 0;
    }
  }

  // Helper methods
  private generateDeviceHash(deviceId: string, userAgent: string): string {
    return Buffer.from(`${deviceId}:${userAgent}`).toString('base64').substring(0, 255);
  }

  /**
   * Generate device fingerprint hash
   */
  generateDeviceFingerprint(userAgent: string, ipAddress: string, deviceInfo: any): string {
    const crypto = require('crypto');
    const fingerprint = `${userAgent}-${ipAddress}-${JSON.stringify(deviceInfo)}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }

  /**
   * Register device (alias for createDeviceFingerprint)
   */
  async registerDevice(userId: bigint, fingerprint: string): Promise<void> {
    // This is handled by createDeviceFingerprint
    logger.debug('Device registered', { userId: userId.toString() });
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(identifier: string, action: string, ipAddress: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    try {
      const windowMs = 15 * 60 * 1000; // 15 minutes
      const maxRequests = 100;
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);
      
      const requestCount = await this.prisma.security_events.count({
        where: {
          ip_address: ipAddress,
          created_at: { gte: windowStart }
        }
      });
      
      if (requestCount >= maxRequests) {
        return {
          allowed: false,
          reason: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000)
        };
      }
      
      // Log this request
      await this.prisma.security_events.create({
        data: {
          identifier,
          action,
          ip_address: ipAddress,
          metadata: { timestamp: new Date() }
        }
      });
      
      return { allowed: true };
    } catch (error: any) {
      logger.error('Rate limit check failed', { identifier, action, error: error.message });
      return { allowed: true }; // Fail open for availability
    }
  }

  /**
   * Check account lockout
   */
  async checkAccountLockout(userId: bigint): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    try {
      const user = await this.prisma.users.findUnique({
        where: { id: userId },
        select: { account_locked_until: true }
      });
      
      if (user?.account_locked_until && user.account_locked_until > new Date()) {
        const retryAfter = Math.ceil((user.account_locked_until.getTime() - Date.now()) / 1000);
        return {
          allowed: false,
          reason: 'Account temporarily locked',
          retryAfter
        };
      }
      
      return { allowed: true };
    } catch (error: any) {
      logger.error('Account lockout check failed', { userId: userId.toString(), error: error.message });
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Detect suspicious activity
   */
  async detectSuspiciousActivity(userId: bigint, ipAddress: string, userAgent: string, action: string): Promise<string[]> {
    const activities: string[] = [];
    
    try {
      // Check for multiple IPs in short time
      const recentEvents = await this.prisma.security_events.findMany({
        where: {
          identifier: userId.toString(),
          action: 'successful_login',
          created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
        },
        select: { ip_address: true }
      });
      
      const uniqueIPs = new Set(recentEvents.map(e => e.ip_address).filter(Boolean));
      if (uniqueIPs.size > 3) {
        activities.push('multiple_ip_addresses');
      }
      
      // Check for rapid login attempts
      if (recentEvents.length > 10) {
        activities.push('rapid_login_attempts');
      }
      
      return activities;
    } catch (error: any) {
      logger.error('Suspicious activity detection failed', { userId: userId.toString(), error: error.message });
      return [];
    }
  }
}

export default SecurityService;