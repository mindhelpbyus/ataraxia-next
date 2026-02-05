/**
 * Hybrid Configuration Manager - CLEAN VERSION
 * 
 * Provides seamless configuration management with:
 * ✅ ENV file as primary source
 * ✅ Database fallback for missing ENV values
 * ✅ Runtime configuration updates
 * ✅ Type-safe configuration access
 * ✅ Caching for performance
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../shared/logger';

const logger = createLogger('config-manager');

export interface ConfigValue {
  key: string;
  value: string | null;
  source: 'env' | 'database' | 'default';
  description?: string;
  lastUpdated: Date;
}

export interface AuthConfig {
  // Auth Provider Configuration
  authProviderType: string;
  authProviderDefault: string;
  enableUniversalAuth: boolean;

  // Cognito Configuration
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;

  // Firebase Configuration
  firebaseProjectId: string;
  firebaseClientEmail?: string;
  firebasePrivateKey?: string;
  firebaseApiKey?: string;

  // Verification Configuration
  emailVerificationRequired: boolean;
  phoneVerificationEnabled: boolean;

  // Onboarding Configuration
  onboardingStepsTotal: number;
  onboardingAutoSave: boolean;
  onboardingBackupInterval: number;

  // Session Configuration
  jwtSecret: string;
  sessionTimeoutMinutes: number;
  refreshTokenExpiryDays: number;

  // Security Configuration
  mfaRequired: boolean;
  passwordMinLength: number;
  passwordRotationDays: number;

  // API Configuration
  apiBaseUrl: string;
  apiTimeout: number;
  enableDetailedErrors: boolean;
}

class ConfigManager {
  private prisma: PrismaClient;
  private configCache: Map<string, ConfigValue> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeDefaultConfigs();
  }

  /**
   * Get configuration value
   * Priority: ENV → Database → Default
   */
  async getConfig(key: string, defaultValue?: string): Promise<ConfigValue> {
    try {
      // Check cache first
      const cached = this.getCachedConfig(key);
      if (cached) {
        return cached;
      }

      // Check environment variable first
      const envValue = process.env[key.toUpperCase()];
      if (envValue !== undefined) {
        const config: ConfigValue = {
          key,
          value: envValue,
          source: 'env',
          lastUpdated: new Date()
        };
        this.setCachedConfig(key, config);
        return config;
      }

      // Check database
      const dbConfig = await this.prisma.system_configs.findUnique({
        where: { config_key: key }
      });

      if (dbConfig && dbConfig.config_value) {
        const config: ConfigValue = {
          key,
          value: dbConfig.config_value,
          source: 'database',
          description: dbConfig.description || undefined,
          lastUpdated: dbConfig.updated_at
        };
        this.setCachedConfig(key, config);
        return config;
      }

      // Use default value
      const config: ConfigValue = {
        key,
        value: defaultValue || null,
        source: 'default',
        lastUpdated: new Date()
      };
      this.setCachedConfig(key, config);
      return config;

    } catch (error: any) {
      logger.error('Failed to get config', { key, error: error.message });
      return {
        key,
        value: defaultValue || null,
        source: 'default',
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Set configuration value in database
   */
  async setConfig(key: string, value: string, description?: string): Promise<void> {
    try {
      await this.prisma.system_configs.upsert({
        where: { config_key: key },
        create: {
          config_key: key,
          config_value: value,
          description: description || null
        },
        update: {
          config_value: value,
          description: description || undefined,
          updated_at: new Date()
        }
      });

      // Update cache
      this.setCachedConfig(key, {
        key,
        value,
        source: 'database',
        description,
        lastUpdated: new Date()
      });

      logger.info('Config updated', { key, source: 'database' });
    } catch (error: any) {
      logger.error('Failed to set config', { key, error: error.message });
      throw error;
    }
  }

  /**
   * Get authentication configuration
   */
  async getAuthConfig(): Promise<AuthConfig> {
    try {
      const configs = await Promise.all([
        this.getConfig('AUTH_PROVIDER_TYPE', 'firebase'),
        this.getConfig('AUTH_PROVIDER_DEFAULT', 'firebase'),
        this.getConfig('ENABLE_UNIVERSAL_AUTH', 'true'),
        this.getConfig('COGNITO_USER_POOL_ID', ''),
        this.getConfig('COGNITO_CLIENT_ID', ''),
        this.getConfig('COGNITO_REGION', 'us-west-2'),
        this.getConfig('FIREBASE_PROJECT_ID', ''),
        this.getConfig('FIREBASE_CLIENT_EMAIL'),
        this.getConfig('FIREBASE_PRIVATE_KEY'),
        this.getConfig('FIREBASE_API_KEY'),
        this.getConfig('EMAIL_VERIFICATION_REQUIRED', 'true'),
        this.getConfig('PHONE_VERIFICATION_ENABLED', 'true'),
        this.getConfig('ONBOARDING_STEPS_TOTAL', '10'),
        this.getConfig('ONBOARDING_AUTO_SAVE', 'true'),
        this.getConfig('ONBOARDING_BACKUP_INTERVAL', '30000'),
        this.getConfig('JWT_SECRET', 'default_jwt_secret'),
        this.getConfig('SESSION_TIMEOUT_MINUTES', '30'),
        this.getConfig('REFRESH_TOKEN_EXPIRY_DAYS', '7'),
        this.getConfig('MFA_REQUIRED', 'false'),
        this.getConfig('PASSWORD_MIN_LENGTH', '12'),
        this.getConfig('PASSWORD_ROTATION_DAYS', '90'),
        this.getConfig('API_BASE_URL', ''),
        this.getConfig('API_TIMEOUT', '30000'),
        this.getConfig('ENABLE_DETAILED_ERRORS', 'false')
      ]);

      return {
        authProviderType: configs[0].value || 'firebase',
        authProviderDefault: configs[1].value || 'firebase',
        enableUniversalAuth: configs[2].value === 'true',
        cognitoUserPoolId: configs[3].value || '',
        cognitoClientId: configs[4].value || '',
        cognitoRegion: configs[5].value || 'us-west-2',
        firebaseProjectId: configs[6].value || '',
        firebaseClientEmail: configs[7].value || undefined,
        firebasePrivateKey: configs[8].value || undefined,
        firebaseApiKey: configs[9].value || undefined,
        emailVerificationRequired: configs[10].value === 'true',
        phoneVerificationEnabled: configs[11].value === 'true',
        onboardingStepsTotal: parseInt(configs[12].value || '10'),
        onboardingAutoSave: configs[13].value === 'true',
        onboardingBackupInterval: parseInt(configs[14].value || '30000'),
        jwtSecret: configs[15].value || 'default_jwt_secret',
        sessionTimeoutMinutes: parseInt(configs[16].value || '30'),
        refreshTokenExpiryDays: parseInt(configs[17].value || '7'),
        mfaRequired: configs[18].value === 'true',
        passwordMinLength: parseInt(configs[19].value || '12'),
        passwordRotationDays: parseInt(configs[20].value || '90'),
        apiBaseUrl: configs[21].value || '',
        apiTimeout: parseInt(configs[22].value || '30000'),
        enableDetailedErrors: configs[23].value === 'true'
      };
    } catch (error: any) {
      logger.error('Failed to get auth config', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Check required environment variables
      const requiredVars = [
        'DATABASE_URL',
        'FIREBASE_PROJECT_ID',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID'
      ];
      
      for (const varName of requiredVars) {
        if (!process.env[varName]) {
          errors.push(`Missing required environment variable: ${varName}`);
        }
      }
      
      // Check database connection
      try {
        await this.prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        errors.push('Database connection failed');
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
      
    } catch (error: any) {
      errors.push(`Configuration validation failed: ${error.message}`);
      return { valid: false, errors };
    }
  }

  /**
   * Get all configurations
   */
  async getAllConfigs(): Promise<Array<{ key: string; value: string; source: string }>> {
    const configs: Array<{ key: string; value: string; source: string }> = [];
    
    try {
      // Get environment variables
      const envVars = [
        'DATABASE_URL',
        'FIREBASE_PROJECT_ID',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID',
        'AWS_REGION',
        'AUTH_PROVIDER_TYPE'
      ];
      
      for (const key of envVars) {
        const value = process.env[key];
        if (value) {
          configs.push({
            key,
            value: key.includes('SECRET') || key.includes('PASSWORD') ? '***' : value,
            source: 'env'
          });
        }
      }
      
      // Get database configs
      const dbConfigs = await this.prisma.system_configs.findMany();
      for (const config of dbConfigs) {
        configs.push({
          key: config.config_key,
          value: config.config_value || '',
          source: 'database'
        });
      }
      
      return configs;
      
    } catch (error: any) {
      logger.error('Failed to get all configs', { error: error.message });
      return [];
    }
  }

  /**
   * Get cached configuration
   */
  private getCachedConfig(key: string): ConfigValue | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.configCache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.configCache.get(key) || null;
  }

  /**
   * Set cached configuration
   */
  private setCachedConfig(key: string, config: ConfigValue): void {
    this.configCache.set(key, config);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Initialize default configurations
   */
  private initializeDefaultConfigs(): void {
    // This could be expanded to set up default configurations
    logger.info('Config manager initialized');
  }
}

// Global instance
let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(prisma: PrismaClient): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager(prisma);
  }
  return configManagerInstance;
}

// Convenience functions
export async function getConfig(prisma: PrismaClient, key: string, defaultValue?: string): Promise<string | null> {
  return (await getConfigManager(prisma).getConfig(key, defaultValue)).value;
}

export async function setConfig(prisma: PrismaClient, key: string, value: string, description?: string): Promise<void> {
  await getConfigManager(prisma).setConfig(key, value, description);
}

export async function getAuthConfig(prisma: PrismaClient): Promise<AuthConfig> {
  return await getConfigManager(prisma).getAuthConfig();
}

export default ConfigManager;