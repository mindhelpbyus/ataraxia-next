#!/usr/bin/env node

/**
 * Pre-Deployment Configuration Validation
 * Ensures all services have required configuration before CDK deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define required configurations for each service
const SERVICE_CONFIGS = {
  'auth-service': {
    required: [
      'DATABASE_URL',
      'JWT_SECRET',
      'COGNITO_USER_POOL_ID',
      'COGNITO_CLIENT_ID',
      'AWS_REGION',
      'AUTH_PROVIDER_TYPE'
    ],
    optional: [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY'
    ]
  },
  'client-service': {
    required: [
      'DATABASE_URL',
      'AUTH_SERVICE_URL',
      'JWT_SECRET',
      'AWS_REGION'
    ],
    optional: [
      'API_TIMEOUT',
      'ENABLE_DETAILED_ERRORS'
    ]
  },
  'therapist-service': {
    required: [
      'DATABASE_URL',
      'AUTH_SERVICE_URL',
      'JWT_SECRET',
      'AWS_REGION',
      'VERIFICATION_SERVICE_URL'
    ],
    optional: [
      'BACKGROUND_CHECK_PROVIDER',
      'MALPRACTICE_VERIFICATION_ENABLED'
    ]
  },
  'verification-service': {
    required: [
      'DATABASE_URL',
      'JWT_SECRET',
      'AWS_REGION',
      'BACKGROUND_CHECK_API_KEY',
      'LICENSE_VERIFICATION_API_KEY'
    ],
    optional: [
      'VERIFICATION_TIMEOUT',
      'AUTO_APPROVE_LICENSES'
    ]
  },
  'config-service': {
    required: [
      'DATABASE_URL',
      'JWT_SECRET',
      'AWS_REGION'
    ],
    optional: [
      'CONFIG_CACHE_TTL',
      'ENABLE_CONFIG_AUDIT'
    ]
  },
  'appointment-service': {
    required: [
      'DATABASE_URL',
      'JWT_SECRET',
      'AWS_REGION'
    ],
    optional: [
      'API_TIMEOUT'
    ]
  }
};

class DeploymentConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.envFiles = [];
    this.services = [];
  }

  /**
   * Main validation function
   */
  async validate() {
    console.log('🔍 Starting pre-deployment configuration validation...\n');

    try {
      // Step 1: Discover services and env files
      await this.discoverServices();
      
      // Step 2: Validate each service configuration
      await this.validateServices();
      
      // Step 3: Validate cross-service dependencies
      await this.validateCrossServiceDependencies();
      
      // Step 4: Validate AWS resources
      await this.validateAWSResources();
      
      // Step 5: Generate validation report
      this.generateReport();
      
      // Step 6: Exit with appropriate code
      if (this.errors.length > 0) {
        console.log('❌ Validation failed. Fix errors before deployment.');
        process.exit(1);
      } else {
        console.log('✅ All validations passed. Ready for deployment!');
        process.exit(0);
      }
      
    } catch (error) {
      console.error('💥 Validation process failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Discover services and their env files
   */
  async discoverServices() {
    console.log('📂 Discovering services...');
    
    // Check for service directories
    const possibleServiceDirs = [
      'src/lambdas',
      '../Ataraxia_backend',
      'infrastructure'
    ];

    for (const dir of possibleServiceDirs) {
      if (fs.existsSync(dir)) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const itemPath = path.join(dir, item);
          if (fs.statSync(itemPath).isDirectory()) {
            const serviceType = this.detectServiceType(item, itemPath);
            if (serviceType !== 'skip') {
              this.services.push({
                name: item,
                path: itemPath,
                type: serviceType
              });
            }
          }
        }
      }
    }

    // Discover env files
    const envFiles = [
      '.env',
      '.env.aws',
      '.env.local',
      '.env.production',
      '.env.deployment'
    ];

    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        this.envFiles.push(envFile);
      }
    }

    console.log(`   Found ${this.services.length} services`);
    console.log(`   Found ${this.envFiles.length} environment files`);
  }

  /**
   * Detect service type based on name and structure
   */
  detectServiceType(name, servicePath) {
    if (name.includes('auth')) return 'auth-service';
    if (name.includes('client')) return 'client-service';
    if (name.includes('therapist')) return 'therapist-service';
    if (name.includes('verification')) return 'verification-service';
    if (name.includes('config')) return 'config-service';
    
    // Skip non-service directories
    const skipDirs = ['.git', 'node_modules', 'bin', 'cdk.out', 'lib', 'dist', 'build'];
    if (skipDirs.includes(name)) return 'skip';
    
    // Check if it's a lambda function
    if (servicePath.includes('lambdas')) {
      if (name === 'appointment') return 'appointment-service';
      return name + '-service';
    }
    
    return 'unknown';
  }

  /**
   * Validate each service configuration
   */
  async validateServices() {
    console.log('\n🔧 Validating service configurations...');

    for (const service of this.services) {
      console.log(`   Validating ${service.name}...`);
      
      const serviceConfig = SERVICE_CONFIGS[service.type];
      if (!serviceConfig) {
        this.warnings.push(`Unknown service type: ${service.type} for ${service.name}`);
        continue;
      }

      // Load environment variables for this service
      const envVars = this.loadEnvironmentVariables();
      
      // Check required configurations
      for (const requiredVar of serviceConfig.required) {
        if (!envVars[requiredVar]) {
          this.errors.push(`${service.name}: Missing required configuration ${requiredVar}`);
        } else {
          // Validate configuration format
          this.validateConfigurationFormat(service.name, requiredVar, envVars[requiredVar]);
        }
      }

      // Check optional configurations
      for (const optionalVar of serviceConfig.optional) {
        if (!envVars[optionalVar]) {
          this.warnings.push(`${service.name}: Optional configuration ${optionalVar} not set`);
        }
      }
    }
  }

  /**
   * Load environment variables from all env files
   */
  loadEnvironmentVariables() {
    const envVars = { ...process.env };

    for (const envFile of this.envFiles) {
      try {
        const content = fs.readFileSync(envFile, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
            }
          }
        }
      } catch (error) {
        this.warnings.push(`Failed to read ${envFile}: ${error.message}`);
      }
    }

    return envVars;
  }

  /**
   * Validate configuration format
   */
  validateConfigurationFormat(serviceName, configKey, configValue) {
    switch (configKey) {
      case 'DATABASE_URL':
        if (!configValue.startsWith('postgresql://')) {
          this.errors.push(`${serviceName}: DATABASE_URL must start with postgresql://`);
        }
        break;
        
      case 'JWT_SECRET':
        if (configValue.length < 32) {
          this.errors.push(`${serviceName}: JWT_SECRET must be at least 32 characters`);
        }
        break;
        
      case 'AWS_REGION':
        const validRegions = ['us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
        if (!validRegions.includes(configValue)) {
          this.warnings.push(`${serviceName}: AWS_REGION ${configValue} may not be supported`);
        }
        break;
        
      case 'COGNITO_USER_POOL_ID':
        if (!configValue.match(/^[a-z0-9-]+_[a-zA-Z0-9]+$/)) {
          this.errors.push(`${serviceName}: COGNITO_USER_POOL_ID format is invalid`);
        }
        break;
        
      case 'AUTH_PROVIDER_TYPE':
        const validProviders = ['cognito', 'firebase', 'auth0'];
        if (!validProviders.includes(configValue)) {
          this.errors.push(`${serviceName}: AUTH_PROVIDER_TYPE must be one of: ${validProviders.join(', ')}`);
        }
        break;
    }
  }

  /**
   * Validate cross-service dependencies
   */
  async validateCrossServiceDependencies() {
    console.log('\n🔗 Validating cross-service dependencies...');

    const envVars = this.loadEnvironmentVariables();
    
    // Check if services can reach each other
    const serviceUrls = {
      'AUTH_SERVICE_URL': envVars.AUTH_SERVICE_URL,
      'CONFIG_SERVICE_URL': envVars.CONFIG_SERVICE_URL,
      'VERIFICATION_SERVICE_URL': envVars.VERIFICATION_SERVICE_URL
    };

    for (const [urlKey, url] of Object.entries(serviceUrls)) {
      if (url) {
        try {
          // Validate URL format
          new URL(url);
        } catch (error) {
          this.errors.push(`Invalid URL format for ${urlKey}: ${url}`);
        }
      }
    }

    // Check database consistency
    const databaseUrls = new Set();
    for (const service of this.services) {
      const serviceConfig = SERVICE_CONFIGS[service.type];
      if (serviceConfig && serviceConfig.required.includes('DATABASE_URL')) {
        databaseUrls.add(envVars.DATABASE_URL);
      }
    }

    if (databaseUrls.size > 1) {
      this.warnings.push('Multiple database URLs detected. Ensure all services use the same database.');
    }
  }

  /**
   * Validate AWS resources
   */
  async validateAWSResources() {
    console.log('\n☁️  Validating AWS resources...');

    const envVars = this.loadEnvironmentVariables();

    try {
      // Check AWS credentials
      if (!envVars.AWS_ACCESS_KEY_ID || !envVars.AWS_SECRET_ACCESS_KEY) {
        this.warnings.push('AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for production deployment');
      }

      // Check if AWS CLI is available and configured (only warn in development)
      try {
        execSync('aws sts get-caller-identity', { stdio: 'pipe' });
        console.log('   ✅ AWS credentials valid');
      } catch (error) {
        if (envVars.NODE_ENV === 'production') {
          this.errors.push('AWS CLI not configured or credentials invalid - required for production deployment');
        } else {
          this.warnings.push('AWS CLI not configured - this is OK for local development');
        }
      }

      // Check if required AWS resources exist (only warn in development)
      if (envVars.COGNITO_USER_POOL_ID) {
        try {
          execSync(`aws cognito-idp describe-user-pool --user-pool-id ${envVars.COGNITO_USER_POOL_ID}`, { stdio: 'pipe' });
          console.log('   ✅ Cognito User Pool exists');
        } catch (error) {
          if (envVars.NODE_ENV === 'production') {
            this.errors.push(`Cognito User Pool ${envVars.COGNITO_USER_POOL_ID} not found - required for production`);
          } else {
            this.warnings.push(`Cognito User Pool ${envVars.COGNITO_USER_POOL_ID} not accessible - this is OK for local development`);
          }
        }
      }

    } catch (error) {
      this.warnings.push(`AWS validation failed: ${error.message}`);
    }
  }

  /**
   * Generate validation report
   */
  generateReport() {
    console.log('\n📊 VALIDATION REPORT');
    console.log('='.repeat(50));

    console.log(`\n📈 Summary:`);
    console.log(`   Services validated: ${this.services.length}`);
    console.log(`   Environment files: ${this.envFiles.length}`);
    console.log(`   Errors: ${this.errors.length}`);
    console.log(`   Warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      console.log(`\n❌ ERRORS (${this.errors.length}):`);
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }

    if (this.errors.length === 0) {
      console.log('\n✅ All critical validations passed!');
      console.log('   Ready for CDK deployment.');
    }

    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      services: this.services.length,
      envFiles: this.envFiles.length,
      errors: this.errors,
      warnings: this.warnings,
      status: this.errors.length === 0 ? 'PASS' : 'FAIL'
    };

    fs.writeFileSync('deployment-validation-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Report saved to: deployment-validation-report.json');
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new DeploymentConfigValidator();
  validator.validate().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = { DeploymentConfigValidator };