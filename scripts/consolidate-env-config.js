#!/usr/bin/env node

/**
 * Environment Configuration Consolidator
 * Merges multiple .env files into a single, clean configuration
 */

const fs = require('fs');
const path = require('path');

class EnvConsolidator {
  constructor() {
    this.config = new Map();
    this.sources = new Map();
    this.comments = new Map();
  }

  /**
   * Consolidate all environment configurations
   */
  consolidate() {
    console.log('🔧 Consolidating environment configuration...\n');

    // Load configurations in priority order
    this.loadEnvFile('.env.aws', 'AWS Configuration');
    this.loadEnvFile('.env', 'Main Configuration');
    this.loadEnvFile('.env.local', 'Local Overrides');

    // Generate consolidated files
    this.generateMainEnvFile();
    this.generateAwsEnvFile();
    this.generateLocalTemplate();

    console.log('\n✅ Environment configuration consolidated!');
    console.log('\nFinal structure:');
    console.log('  .env          - Main configuration (commit this)');
    console.log('  .env.aws      - AWS-specific settings (commit this)');
    console.log('  .env.local    - Local overrides (DO NOT commit)');
    console.log('  .env.template - Template for new developers');
  }

  /**
   * Load environment file and parse variables
   */
  loadEnvFile(filename, description) {
    if (!fs.existsSync(filename)) {
      console.log(`⚠️  ${filename} not found, skipping...`);
      return;
    }

    console.log(`📂 Loading ${filename} (${description})`);
    
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n');
    
    let currentComment = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Handle comments
      if (trimmed.startsWith('#')) {
        currentComment += trimmed + '\n';
        continue;
      }
      
      // Handle empty lines
      if (!trimmed) {
        currentComment = '';
        continue;
      }
      
      // Handle key=value pairs
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
        
        // Store configuration
        this.config.set(key, value);
        this.sources.set(key, filename);
        
        if (currentComment) {
          this.comments.set(key, currentComment.trim());
          currentComment = '';
        }
      }
    }
  }

  /**
   * Generate main .env file with non-AWS configurations
   */
  generateMainEnvFile() {
    console.log('📝 Generating main .env file...');
    
    const mainCategories = {
      'Database': ['DATABASE_URL', 'DATABASE_SCHEMA'],
      'Authentication': ['AUTH_PROVIDER_TYPE', 'JWT_SECRET'],
      'Application': ['API_PORT', 'NODE_ENV', 'LOG_LEVEL'],
      'Session': ['SESSION_TIMEOUT_MINUTES', 'REFRESH_TOKEN_EXPIRY_DAYS'],
      'Security': ['MFA_REQUIRED', 'PASSWORD_MIN_LENGTH'],
      'Verification': ['EMAIL_VERIFICATION_REQUIRED', 'PHONE_VERIFICATION_ENABLED']
    };

    let content = this.generateFileHeader('Main Environment Configuration');
    
    for (const [category, keys] of Object.entries(mainCategories)) {
      const categoryVars = keys.filter(key => this.config.has(key));
      
      if (categoryVars.length > 0) {
        content += `\n# ============================================\n`;
        content += `# ${category.toUpperCase()}\n`;
        content += `# ============================================\n\n`;
        
        for (const key of categoryVars) {
          if (this.comments.has(key)) {
            content += this.comments.get(key) + '\n';
          }
          content += `${key}=${this.config.get(key)}\n\n`;
        }
      }
    }

    fs.writeFileSync('.env', content);
    console.log('   ✅ Generated .env');
  }

  /**
   * Generate AWS-specific .env file
   */
  generateAwsEnvFile() {
    console.log('📝 Generating .env.aws file...');
    
    const awsKeys = Array.from(this.config.keys()).filter(key => 
      key.startsWith('AWS_') || 
      key.startsWith('COGNITO_') ||
      key.includes('REGION') ||
      key.includes('ACCOUNT_ID')
    );

    if (awsKeys.length === 0) {
      console.log('   ⚠️  No AWS configuration found');
      return;
    }

    let content = this.generateFileHeader('AWS Configuration');
    content += `\n# ============================================\n`;
    content += `# AWS CREDENTIALS AND SERVICES\n`;
    content += `# ============================================\n\n`;

    for (const key of awsKeys.sort()) {
      if (this.comments.has(key)) {
        content += this.comments.get(key) + '\n';
      }
      content += `${key}=${this.config.get(key)}\n\n`;
    }

    fs.writeFileSync('.env.aws', content);
    console.log('   ✅ Generated .env.aws');
  }

  /**
   * Generate local template file
   */
  generateLocalTemplate() {
    console.log('📝 Generating .env.local template...');
    
    let content = this.generateFileHeader('Local Development Overrides');
    content += `# This file is for local development overrides only\n`;
    content += `# Copy this to .env.local and customize as needed\n`;
    content += `# DO NOT COMMIT .env.local TO VERSION CONTROL\n\n`;
    
    content += `# ============================================\n`;
    content += `# LOCAL DEVELOPMENT OVERRIDES\n`;
    content += `# ============================================\n\n`;
    
    content += `# Override API port for local development\n`;
    content += `# API_PORT=3010\n\n`;
    
    content += `# Override database for local testing\n`;
    content += `# DATABASE_URL=postgresql://localhost:5432/ataraxia_local\n\n`;
    
    content += `# Enable detailed errors in development\n`;
    content += `# ENABLE_DETAILED_ERRORS=true\n\n`;
    
    content += `# Override log level for debugging\n`;
    content += `# LOG_LEVEL=debug\n\n`;

    fs.writeFileSync('.env.local.template', content);
    console.log('   ✅ Generated .env.local.template');
  }

  /**
   * Generate file header
   */
  generateFileHeader(title) {
    return `# ${title}\n` +
           `# Generated on: ${new Date().toISOString()}\n` +
           `# DO NOT EDIT THIS FILE DIRECTLY - Use consolidation script\n\n`;
  }

  /**
   * Show configuration summary
   */
  showSummary() {
    console.log('\n📊 Configuration Summary:');
    console.log(`   Total variables: ${this.config.size}`);
    
    const sourceCount = {};
    for (const source of this.sources.values()) {
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    }
    
    for (const [source, count] of Object.entries(sourceCount)) {
      console.log(`   From ${source}: ${count} variables`);
    }
  }
}

// Run consolidation if called directly
if (require.main === module) {
  const consolidator = new EnvConsolidator();
  consolidator.consolidate();
  consolidator.showSummary();
}

module.exports = { EnvConsolidator };