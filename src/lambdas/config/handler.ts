/**
 * Configuration Lambda Handler
 * 
 * Provides endpoints to view and manage the hybrid configuration system
 * Shows ENV → Database → Default priority and current auth configuration
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { getConfigManager } from '../../lib/configManager';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse } from '../../shared/response';

const logger = createLogger('config-service');

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const path = event.path;
  const method = event.httpMethod;

  const logContext = {
    requestId,
    path,
    method,
    userAgent: event.headers['User-Agent'],
    ip: event.requestContext.identity.sourceIp
  };

  logger.info('Config request received', logContext);

  try {
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return successResponse({}, 'CORS preflight', requestId);
    }

    const prisma = getPrisma();
    const configManager = getConfigManager(prisma);

    // Configuration status endpoint
    if (path.includes('/config/status') && method === 'GET') {
      return await handleConfigStatus(configManager, requestId, logContext);
    }

    // Auth configuration endpoint
    if (path.includes('/config/auth') && method === 'GET') {
      return await handleAuthConfig(configManager, requestId, logContext);
    }

    // All configurations endpoint
    if (path.includes('/config/all') && method === 'GET') {
      return await handleAllConfigs(configManager, requestId, logContext);
    }

    // Configuration validation endpoint
    if (path.includes('/config/validate') && method === 'GET') {
      return await handleConfigValidation(configManager, requestId, logContext);
    }

    return errorResponse(404, `Route not found: ${method} ${path}`, requestId);

  } catch (error: any) {
    logger.error('Config Lambda Error', logContext, error);
    return errorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Get configuration status and hybrid system overview
 */
async function handleConfigStatus(
  configManager: ReturnType<typeof getConfigManager>,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  try {
    // Get validation status
    const validation = await configManager.validateConfig();
    
    // Get some key configurations to show sources
    const keyConfigs = await Promise.all([
      configManager.getConfig('auth_provider_type'),
      configManager.getConfig('cognito_user_pool_id'),
      configManager.getConfig('jwt_secret'),
      configManager.getConfig('session_timeout_minutes'),
      configManager.getConfig('onboarding_steps_total')
    ]);

    // Count configurations by source
    const allConfigs = await configManager.getAllConfigs();
    const configSources = {
      env: allConfigs.filter(c => c.source === 'env').length,
      database: allConfigs.filter(c => c.source === 'database').length,
      default: allConfigs.filter(c => c.source === 'default').length,
      total: allConfigs.length
    };

    const status = {
      system: {
        name: 'Ataraxia-Next Hybrid Configuration',
        version: '1.0.0',
        status: validation.valid ? 'healthy' : 'warning',
        timestamp: new Date().toISOString()
      },
      hybridSystem: {
        priority: 'ENV → Database → Default',
        configSources,
        cacheEnabled: true,
        cacheTTL: '5 minutes'
      },
      validation: {
        isValid: validation.valid,
        missingConfigs: validation.errors,
        warnings: []
      },
      keyConfigurations: keyConfigs.map(config => ({
        key: config.key,
        source: config.source,
        hasValue: !!config.value,
        lastUpdated: config.lastUpdated
      })),
      authProvider: {
        current: keyConfigs[0].value,
        source: keyConfigs[0].source,
        cognitoConfigured: !!keyConfigs[1].value,
        sessionTimeout: keyConfigs[3].value + ' minutes'
      }
    };

    return successResponse(status, 'Configuration status retrieved', requestId);

  } catch (error: any) {
    logger.error('Failed to get config status', logContext, error);
    return errorResponse(500, 'Failed to retrieve configuration status', requestId);
  }
}

/**
 * Get complete auth configuration
 */
async function handleAuthConfig(
  configManager: ReturnType<typeof getConfigManager>,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  try {
    const authConfig = await configManager.getAuthConfig();
    
    // Mask sensitive values for API response
    const maskedConfig = {
      ...authConfig,
      jwtSecret: authConfig.jwtSecret ? '***MASKED***' : null,
      firebasePrivateKey: authConfig.firebasePrivateKey ? '***MASKED***' : null,
      firebaseClientEmail: authConfig.firebaseClientEmail ? '***MASKED***' : null
    };

    // Add source information for each config
    const configSources = await Promise.all([
      configManager.getConfig('auth_provider_type'),
      configManager.getConfig('cognito_user_pool_id'),
      configManager.getConfig('cognito_client_id'),
      configManager.getConfig('email_verification_required'),
      configManager.getConfig('phone_verification_enabled'),
      configManager.getConfig('session_timeout_minutes')
    ]);

    const response = {
      authConfiguration: maskedConfig,
      configurationSources: configSources.map(config => ({
        key: config.key,
        source: config.source,
        lastUpdated: config.lastUpdated,
        description: config.description
      })),
      metadata: {
        retrievedAt: new Date().toISOString(),
        hybridSystemActive: true,
        priorityOrder: ['ENV', 'Database', 'Default']
      }
    };

    return successResponse(response, 'Auth configuration retrieved', requestId);

  } catch (error: any) {
    logger.error('Failed to get auth config', logContext, error);
    return errorResponse(500, 'Failed to retrieve auth configuration', requestId);
  }
}

/**
 * Get all configurations with sources
 */
async function handleAllConfigs(
  configManager: ReturnType<typeof getConfigManager>,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  try {
    const allConfigs = await configManager.getAllConfigs();
    
    // Group by source
    const groupedConfigs = {
      env: allConfigs.filter(c => c.source === 'env'),
      database: allConfigs.filter(c => c.source === 'database'),
      default: allConfigs.filter(c => c.source === 'default')
    };

    // Mask sensitive values
    const maskSensitiveValue = (key: string, value: string | null) => {
      const sensitiveKeys = ['secret', 'key', 'password', 'token', 'private'];
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        return value ? '***MASKED***' : null;
      }
      return value;
    };

    const maskedConfigs = {
      env: groupedConfigs.env.map(c => ({
        ...c,
        value: maskSensitiveValue(c.key, c.value)
      })),
      database: groupedConfigs.database.map(c => ({
        ...c,
        value: maskSensitiveValue(c.key, c.value)
      })),
      default: groupedConfigs.default.map(c => ({
        ...c,
        value: maskSensitiveValue(c.key, c.value)
      }))
    };

    const response = {
      configurations: maskedConfigs,
      summary: {
        total: allConfigs.length,
        bySource: {
          env: groupedConfigs.env.length,
          database: groupedConfigs.database.length,
          default: groupedConfigs.default.length
        }
      },
      metadata: {
        retrievedAt: new Date().toISOString(),
        note: 'Sensitive values are masked for security'
      }
    };

    return successResponse(response, 'All configurations retrieved', requestId);

  } catch (error: any) {
    logger.error('Failed to get all configs', logContext, error);
    return errorResponse(500, 'Failed to retrieve configurations', requestId);
  }
}

/**
 * Validate configuration
 */
async function handleConfigValidation(
  configManager: ReturnType<typeof getConfigManager>,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  try {
    const validation = await configManager.validateConfig();
    
    const response = {
      validation: {
        isValid: validation.valid,
        status: validation.valid ? 'PASS' : 'FAIL',
        missingConfigurations: validation.errors,
        warnings: [],
        checkedAt: new Date().toISOString()
      },
      recommendations: validation.errors.length > 0 ? [
        'Review warning configurations for production readiness',
        'Consider setting secure values for default configurations',
        'Ensure all required configurations are properly set'
      ] : [
        'All configurations are properly set',
        'System is ready for production use'
      ]
    };

    return successResponse(response, 'Configuration validation completed', requestId);

  } catch (error: any) {
    logger.error('Failed to validate config', logContext, error);
    return errorResponse(500, 'Failed to validate configuration', requestId);
  }
}