#!/usr/bin/env node

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
    missing.forEach(v => console.log(`   - ${v}`));
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Missing optional variables:');
    warnings.forEach(v => console.log(`   - ${v}`));
  }
  
  console.log('✅ Configuration validation passed!');
}

// Load .env file if it exists
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

validateConfig();
