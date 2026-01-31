/**
 * Bootstrap Configuration Service
 * Provides initial configuration to services that don't have database access
 */

import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface BootstrapConfig {
  databaseUrl: string;
  configServiceUrl: string;
  authProviderType: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  jwtSecret: string;
  region: string;
}

export class BootstrapConfigService {
  private ssmClient: SSMClient;
  private secretsClient: SecretsManagerClient;
  private region: string;

  constructor(region: string = 'us-west-2') {
    this.region = region;
    this.ssmClient = new SSMClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
  }

  /**
   * Get bootstrap configuration from AWS Parameter Store and Secrets Manager
   */
  async getBootstrapConfig(): Promise<BootstrapConfig> {
    try {
      // Get parameters from SSM Parameter Store
      const parameterNames = [
        '/ataraxia/config/database-url',
        '/ataraxia/config/config-service-url',
        '/ataraxia/config/auth-provider-type',
        '/ataraxia/config/cognito-user-pool-id',
        '/ataraxia/config/cognito-client-id',
        '/ataraxia/config/region'
      ];

      const getParametersCommand = new GetParametersCommand({
        Names: parameterNames,
        WithDecryption: true
      });

      const parametersResponse = await this.ssmClient.send(getParametersCommand);
      const parameters = parametersResponse.Parameters || [];

      // Get JWT secret from Secrets Manager
      const getSecretCommand = new GetSecretValueCommand({
        SecretId: '/ataraxia/secrets/jwt-secret'
      });

      const secretResponse = await this.secretsClient.send(getSecretCommand);
      const jwtSecret = secretResponse.SecretString || 'fallback-secret';

      // Build configuration object
      const config: BootstrapConfig = {
        databaseUrl: this.getParameterValue(parameters, '/ataraxia/config/database-url') || '',
        configServiceUrl: this.getParameterValue(parameters, '/ataraxia/config/config-service-url') || '',
        authProviderType: this.getParameterValue(parameters, '/ataraxia/config/auth-provider-type') || 'cognito',
        cognitoUserPoolId: this.getParameterValue(parameters, '/ataraxia/config/cognito-user-pool-id'),
        cognitoClientId: this.getParameterValue(parameters, '/ataraxia/config/cognito-client-id'),
        jwtSecret,
        region: this.getParameterValue(parameters, '/ataraxia/config/region') || this.region
      };

      return config;
    } catch (error) {
      console.error('Failed to get bootstrap configuration:', error);
      throw new Error('Bootstrap configuration failed');
    }
  }

  /**
   * Get configuration from the central config service
   */
  async getConfigFromService(configServiceUrl: string, configKey?: string): Promise<any> {
    try {
      const url = configKey 
        ? `${configServiceUrl}/api/config/${configKey}`
        : `${configServiceUrl}/api/config`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Config service responded with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get config from service:', error);
      throw error;
    }
  }

  private getParameterValue(parameters: any[], name: string): string | undefined {
    const param = parameters.find(p => p.Name === name);
    return param?.Value;
  }
}

/**
 * Initialize service with bootstrap configuration
 */
export async function initializeServiceWithBootstrap(): Promise<BootstrapConfig> {
  const bootstrapService = new BootstrapConfigService();
  
  try {
    // Try to get bootstrap config from AWS services
    const config = await bootstrapService.getBootstrapConfig();
    
    // Set environment variables for the service
    process.env.DATABASE_URL = config.databaseUrl;
    process.env.CONFIG_SERVICE_URL = config.configServiceUrl;
    process.env.AUTH_PROVIDER_TYPE = config.authProviderType;
    process.env.JWT_SECRET = config.jwtSecret;
    process.env.AWS_REGION = config.region;
    
    if (config.cognitoUserPoolId) {
      process.env.COGNITO_USER_POOL_ID = config.cognitoUserPoolId;
    }
    
    if (config.cognitoClientId) {
      process.env.COGNITO_CLIENT_ID = config.cognitoClientId;
    }

    console.log('✅ Service initialized with bootstrap configuration');
    return config;
    
  } catch (error) {
    console.error('❌ Bootstrap initialization failed:', error);
    throw error;
  }
}