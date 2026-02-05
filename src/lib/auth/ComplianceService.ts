/**
 * Compliance Service - Simplified for current schema
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('compliance-service');

export interface AuditEvent {
  userId: bigint;
  action: string;
  resource: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface ConsentRecord {
  userId: bigint;
  consentType: string;
  version: string;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export class ComplianceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Record audit event
   */
  async recordAuditEvent(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.compliance_audit_log.create({
        data: {
          audit_id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user_id: event.userId,
          action: event.action,
          resource_type: event.resource,
          old_values: event.details,
          ip_address: event.ipAddress,
          user_agent: event.userAgent,
          compliance_level: 'standard'
        }
      });

      logger.debug('Audit event recorded', {
        userId: event.userId.toString(),
        action: event.action
      });

    } catch (error: any) {
      logger.error('Failed to record audit event', { 
        userId: event.userId.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(consent: ConsentRecord): Promise<boolean> {
    try {
      await this.prisma.privacy_consents.create({
        data: {
          user_id: consent.userId,
          consent_type: consent.consentType,
          version: consent.version,
          granted: consent.granted,
          granted_at: consent.granted ? consent.timestamp : null,
          ip_address: consent.ipAddress,
          consent_details: { user_agent: consent.userAgent }
        }
      });

      logger.info('Consent recorded', {
        userId: consent.userId.toString(),
        consentType: consent.consentType,
        granted: consent.granted
      });

      return true;

    } catch (error: any) {
      logger.error('Failed to record consent', { 
        userId: consent.userId.toString(), 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Get user consents
   */
  async getUserConsents(userId: bigint): Promise<ConsentRecord[]> {
    try {
      const consents = await this.prisma.privacy_consents.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' }
      });

      return consents.map(consent => ({
        userId: consent.user_id,
        consentType: consent.consent_type,
        version: consent.version,
        granted: consent.granted,
        ipAddress: consent.ip_address?.toString(),
        timestamp: consent.granted_at || new Date() || consent.created_at
      }));

    } catch (error: any) {
      logger.error('Failed to get user consents', { 
        userId: userId.toString(), 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Request data export
   */
  async requestDataExport(userId: bigint, requestedBy: bigint, requestType: string = 'full'): Promise<string> {
    try {
      const requestId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await this.prisma.data_requests.create({
        data: {
          request_id: requestId,
          user_id: userId,
          requested_by: requestedBy,
          request_type: requestType,
          reason: 'User data export request',
          status: 'pending'
        }
      });

      logger.info('Data export requested', { 
        userId: userId.toString(), 
        requestId, 
        requestType 
      });

      return requestId;

    } catch (error: any) {
      logger.error('Failed to request data export', { 
        userId: userId.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete user data (GDPR compliance)
   */
  async deleteUserData(userId: bigint, requestedBy: bigint): Promise<boolean> {
    try {
      // Mark user as anonymized instead of hard delete
      await this.prisma.users.update({
        where: { id: userId },
        data: {
          is_anonymized: true,
          anonymized_at: new Date(),
          anonymization_reason: 'GDPR deletion request'
        }
      });

      logger.info('User data deletion initiated', { 
        userId: userId.toString(), 
        requestedBy: requestedBy.toString() 
      });

      return true;

    } catch (error: any) {
      logger.error('Failed to delete user data', { 
        userId: userId.toString(), 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Create audit trail
   */
  async createAuditTrail(event: {
    userId: bigint;
    action: string;
    resourceType: string;
    resourceId: string;
    oldValues?: any;
    newValues?: any;
    ipAddress: string;
    userAgent: string;
    complianceLevel: string;
  }): Promise<void> {
    try {
      await this.prisma.compliance_audit_log.create({
        data: {
          audit_id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user_id: event.userId,
          action: event.action,
          resource_type: event.resourceType,
          resource_id: event.resourceId,
          old_values: event.oldValues || {},
          new_values: event.newValues || {},
          ip_address: event.ipAddress,
          user_agent: event.userAgent,
          compliance_level: event.complianceLevel
        }
      });

      logger.debug('Audit trail created', {
        userId: event.userId.toString(),
        action: event.action,
        resourceType: event.resourceType
      });

    } catch (error: any) {
      logger.error('Failed to create audit trail', { 
        userId: event.userId.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Search audit trails
   */
  async searchAuditTrails(filters: {
    userId?: bigint;
    action?: string;
    resourceType?: string;
    complianceLevel?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      const where: any = {};
      
      if (filters.userId) where.user_id = filters.userId;
      if (filters.action) where.action = filters.action;
      if (filters.resourceType) where.resource_type = filters.resourceType;
      if (filters.complianceLevel) where.compliance_level = filters.complianceLevel;
      if (filters.startDate || filters.endDate) {
        where.created_at = {};
        if (filters.startDate) where.created_at.gte = filters.startDate;
        if (filters.endDate) where.created_at.lte = filters.endDate;
      }

      const auditTrails = await this.prisma.compliance_audit_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: filters.limit || 100,
        skip: filters.offset || 0
      });

      return auditTrails;

    } catch (error: any) {
      logger.error('Failed to search audit trails', { error: error.message });
      return [];
    }
  }

  /**
   * Handle data export request
   */
  async handleDataExportRequest(userId: bigint, requestedBy: bigint, reason: string): Promise<string> {
    try {
      const requestId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await this.prisma.data_requests.create({
        data: {
          request_id: requestId,
          user_id: userId,
          requested_by: requestedBy,
          request_type: 'full_export',
          reason: reason,
          status: 'pending'
        }
      });

      logger.info('Data export request created', { 
        userId: userId.toString(), 
        requestId, 
        reason 
      });

      return requestId;

    } catch (error: any) {
      logger.error('Failed to handle data export request', { 
        userId: userId.toString(), 
        error: error.message 
      });
      throw error;
    }
  }
}

export default ComplianceService;