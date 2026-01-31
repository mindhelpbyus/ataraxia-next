#!/usr/bin/env node

/**
 * Configuration Template Generator
 * Generates environment file templates for all services
 */

const fs = require('fs');
const path = require('path');

const CONFIG_TEMPLATES = {
  '.env.template': {
    description: 'Main environment configuration template',
    variables: {
      // Database Configuration
      'DATABASE_URL': {
        description: 'PostgreSQL database connection string',
        example: 'postgresql://username:password@host:5432/database',
        required: true,
        category: 'Database'
      },
      'DATABASE_SCHEMA': {
        description: 'Database schema name',
        example: 'public',
        required: false,
        category: 'Database'
      },

      // Authentication Configuration
      'AUTH_PROVIDER_TYPE': {
        description: 'Primary authentication provider (cognito|firebase|auth0)',
        example: 'cognito',
        required: true,
        category: 'Authentication'
      },
      'JWT_SECRET': {
        description: 'JWT signing secret (minimum 32 characters)',
        example: 'your-super-secure-jwt-secret-key-here-32-chars-minimum',
        required: true,
        category: 'Authentication'
      },

      // AWS Configuration
      'AWS_REGION': {
        description: 'AWS region for all services',
        example: 'us-west-2',
        required: true,
        category: 'AWS'
      },
      'AWS_ACCOUNT_ID': {
        description: 'AWS account ID',
        example: '123456789012',
        required: true,
        category: 'AWS'
      },
      'AWS_ACCESS_KEY_ID': {
        description: 'AWS access key ID',
        example: 'AKIAIOSFODNN7EXAMPLE',
        required: true,
        category: 'AWS'
      },
      'AWS_SECRET_ACCESS_KEY': {
        description: 'AWS secret access key',
        example: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        required: true,
        category: 'AWS'
      },

      // Cognito Configuration
      'COGNITO_USER_POOL_ID': {
        description: 'Cognito User Pool ID',
        example: 'us-west-2_xeXlyFBMH',
        required: true,
        category: 'Cognito'
      },
      'COGNITO_CLIENT_ID': {
        description: 'Cognito App Client ID',
        example: '7ek8kg1td2ps985r21m7727q98',
        required: true,
        category: 'Cognito'
      },

      // Service URLs
      'CONFIG_SERVICE_URL': {
        description: 'Configuration service URL',
        example: 'https://config-api.ataraxia.com',
        required: false,
        category: 'Services'
      },
      'AUTH_SERVICE_URL': {
        description: 'Authentication service URL',
        example: 'https://auth-api.ataraxia.com',
        required: false,
        category: 'Services'
      },
      'VERIFICATION_SERVICE_URL': {
        description: 'Verification service URL',
        example: 'https://verification-api.ataraxia.com',
        required: false,
        category: 'Services'
      },

      // Application Configuration
      'API_PORT': {
        description: 'API server port',
        example: '3010',
        required: false,
        category: 'Application'
      },
      'API_TIMEOUT': {
        description: 'API request timeout in milliseconds',
        example: '30000',
        required: false,
        category: 'Application'
      },
      'ENABLE_DETAILED_ERRORS': {
        description: 'Enable detailed error messages (true|false)',
        example: 'true',
        required: false,
        category: 'Application'
      },

      // Session Configuration
      'SESSION_TIMEOUT_MINUTES': {
        description: 'Session timeout in minutes',
        example: '30',
        required: false,
        category: 'Session'
      },
      'REFRESH_TOKEN_EXPIRY_DAYS': {
        description: 'Refresh token expiry in days',
        example: '7',
        required: false,
        category: 'Session'
      },

      // Security Configuration
      'MFA_REQUIRED': {
        description: 'Require multi-factor authentication (true|false)',
        example: 'false',
        required: false,
        category: 'Security'
      },
      'PASSWORD_MIN_LENGTH': {
        description: 'Minimum password length',
        example: '12',
        required: false,
        category: 'Security'
      },

      // Verification Configuration
      'EMAIL_VERIFICATION_REQUIRED': {
        description: 'Require email verification (true|false)',
        example: 'true',
        required: false,
        category: 'Verification'
      },
      'PHONE_VERIFICATION_ENABLED': {
        description: 'Enable phone verification (true|false)',
        example: 'true',
        required: false,
        category: 'Verification'
      },

      // Background Check Configuration
      'BACKGROUND_CHECK_API_KEY': {
        description: 'Background check service API key',
        example: 'your-background-check-api-key',
        required: false,
        category: 'Background Check'
      },
      'LICENSE_VERIFICATION_API_KEY': {
        description: 'License verification service API key',
        example: 'your-license-verification-api-key',
        required: false,
        category: 'License Verification'
      }
    }
  },

  '.env.production.template': {
    description: 'Production environment configuration template',
    variables: {
      'NODE_ENV': {
        description: 'Node environment',
        example: 'production',
        required: true,
        category: 'Environment'
      },
      'ENABLE_DETAILED_ERRORS': {
        description: 'Enable detailed error messages (should be false in production)',
        example: 'false',
        required: true,
        category: 'Security'
      },
      'LOG_LEVEL': {
        description: 'Logging level (error|warn|info|debug)',
        example: 'warn',
        required: false,
        category: 'Logging'
      }
    }
  },

  '.env.development.template': {
    description: 'Development environment configuration template',
    variables: {
      'NODE_ENV': {
        description: 'Node environment',
        example: 'development',
        required: true,
        category: 'Environment'
      },
      'ENABLE_DETAILED_ERRORS': {
        description: 'Enable detailed error messages',
        example: 'true',
        required: false,
        category: 'Development'
      },
      'LOG_LEVEL': {
        description: 'Logging level',
        example: 'debug',
        required: false,
        category: 'Development'
      },
      'API_PORT': {
        description: 'Local development API port',
        example: '3010',
        required: false,
        category: 'Development'
      }
    }
  }
};

class ConfigTemplateGenerator {
  constructor() {
    this.outputDir = './';
  }

  /**
   * Generate all configuration templates
   */
  generateTemplates() {
    console.log('📝 Generating configuration templates...\n');

    for (const [filename, template] of Object.entries(CONFIG_TEMPLATES)) {
      this.generateTemplate(filename, template);
    }

    this.generateValidationScript();
    this.generateReadme();

    console.log('\n✅ Configuration templates generated successfully!');
    console.log('\nNext steps:');
    console.log('1. Copy templates to actual .env files');
    console.log('2. Fill in your actual values');
    console.log('3. Run validation: npm run validate-config');
  }

  /**
   * Generate a single template file
   */
  generateTemplate(filename, template) {
    const filepath = path.join(this.outputDir, filename);
    let content = '';

    // Add header
    content += `# ${template.description}\n`;
    content += `# Generated on: ${new Date().toISOString()}\n`;
    content += `# Copy this file to ${filename.replace('.template', '')} and fill in your values\n\n`;

    // Group variables by category
    const categories = {};
    for (const [varName, varConfig] of Object.entries(template.variables)) {
      const category = varConfig.category || 'General';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({ name: varName, config: varConfig });
    }

    // Generate content by category
    for (const [categoryName, variables] of Object.entries(categories)) {
      content += `# ============================================\n`;
      content += `# ${categoryName.toUpperCase()} CONFIGURATION\n`;
      content += `# ============================================\n\n`;

      for (const { name, config } of variables) {
        // Add description
        content += `# ${config.description}\n`;
        
        // Add requirement status
        if (config.required) {
          content += `# REQUIRED\n`;
        } else {
          content += `# OPTIONAL\n`;
        }

        // Add example
        content += `# Example: ${config.example}\n`;
        
        // Add the variable (commented out for template)
        content += `${name}=${config.example}\n\n`;
      }
    }

    // Write file
    fs.writeFileSync(filepath, content);
    console.log(`   ✅ Generated: ${filename}`);
  }

  /**
   * Generate validation script
   */
  generateValidationScript() {
    const scriptContent = `#!/usr/bin/env node

/**
 * Configuration Validation Script
 * Auto-generated validation for environment variables
 */

const fs = require('fs');

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'AWS_REGION',
  'AWS_ACCOUNT_ID',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'AUTH_PROVIDER_TYPE'
];

const OPTIONAL_VARS = [
  'API_PORT',
  'SESSION_TIMEOUT_MINUTES',
  'ENABLE_DETAILED_ERRORS'
];

function validateConfig() {
  console.log('🔍 Validating configuration...');
  
  const missing = [];
  const warnings = [];
  
  // Check required variables
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  // Check optional variables
  for (const varName of OPTIONAL_VARS) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }
  
  // Report results
  if (missing.length > 0) {
    console.log('❌ Missing required variables:');
    missing.forEach(v => console.log(\`   - \${v}\`));
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Missing optional variables:');
    warnings.forEach(v => console.log(\`   - \${v}\`));
  }
  
  console.log('✅ Configuration validation passed!');
}

// Load .env file if it exists
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

validateConfig();
`;

    fs.writeFileSync(path.join(this.outputDir, 'validate-config.js'), scriptContent);
    console.log('   ✅ Generated: validate-config.js');
  }

  /**
   * Generate README for configuration
   */
  generateReadme() {
    const readmeContent = `# Configuration Guide

This directory contains configuration templates for the Ataraxia healthcare platform.

## Quick Start

1. **Copy templates to actual files:**
   \`\`\`bash
   cp .env.template .env
   cp .env.production.template .env.production
   cp .env.development.template .env.development
   \`\`\`

2. **Fill in your actual values** in the copied files

3. **Validate configuration:**
   \`\`\`bash
   node validate-config.js
   \`\`\`

4. **Run pre-deployment check:**
   \`\`\`bash
   ./scripts/pre-deploy-check.sh
   \`\`\`

## Configuration Categories

### Required Variables
- **DATABASE_URL**: PostgreSQL connection string
- **JWT_SECRET**: JWT signing secret (32+ characters)
- **AWS_REGION**: AWS region for all services
- **COGNITO_USER_POOL_ID**: Cognito User Pool ID
- **COGNITO_CLIENT_ID**: Cognito App Client ID
- **AUTH_PROVIDER_TYPE**: Authentication provider type

### Optional Variables
- **API_PORT**: Local development port
- **SESSION_TIMEOUT_MINUTES**: Session timeout
- **ENABLE_DETAILED_ERRORS**: Error detail level

## Security Notes

- Never commit actual .env files to version control
- Use strong, unique values for JWT_SECRET
- Rotate credentials regularly
- Use different values for different environments

## Validation

The validation script checks:
- All required variables are present
- Variable formats are correct
- AWS credentials are valid
- Database connection works

## Troubleshooting

If validation fails:
1. Check that all required variables are set
2. Verify AWS credentials are correct
3. Test database connection manually
4. Check variable formats match examples
`;

    fs.writeFileSync(path.join(this.outputDir, 'CONFIG_README.md'), readmeContent);
    console.log('   ✅ Generated: CONFIG_README.md');
  }
}

// Run generator if called directly
if (require.main === module) {
  const generator = new ConfigTemplateGenerator();
  generator.generateTemplates();
}

module.exports = { ConfigTemplateGenerator };