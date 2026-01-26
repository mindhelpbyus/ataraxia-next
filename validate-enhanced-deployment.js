#!/usr/bin/env node

/**
 * Enhanced Deployment Validation Script
 * 
 * Comprehensive validation of the enhanced therapist service deployment:
 * - Infrastructure validation (CDK, Lambda, API Gateway)
 * - Database schema validation
 * - API endpoint testing
 * - Enhanced feature validation
 * - Performance benchmarking
 * - Security compliance checks
 */

const AWS = require('aws-sdk');
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-west-2'
});

const lambda = new AWS.Lambda();
const apigateway = new AWS.APIGateway();
const cloudwatch = new AWS.CloudWatch();
const cognito = new AWS.CognitoIdentityServiceProvider();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Validation configuration
const config = {
  environment: process.env.NODE_ENV || 'dev',
  apiBaseUrl: process.env.API_BASE_URL || process.env.VITE_API_BASE_URL,
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || process.env.VITE_COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.COGNITO_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID,
  region: process.env.AWS_REGION || 'us-west-2'
};

// Validation results
let validationResults = {
  infrastructure: { passed: 0, failed: 0, tests: [] },
  database: { passed: 0, failed: 0, tests: [] },
  api: { passed: 0, failed: 0, tests: [] },
  features: { passed: 0, failed: 0, tests: [] },
  performance: { passed: 0, failed: 0, tests: [] },
  security: { passed: 0, failed: 0, tests: [] }
};

// Logging functions
function log(level, message, category = 'general') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;
  console.log(logMessage);
}

function logSuccess(message, category) {
  log('success', `✅ ${message}`, category);
}

function logError(message, category) {
  log('error', `❌ ${message}`, category);
}

function logWarning(message, category) {
  log('warning', `⚠️  ${message}`, category);
}

function logInfo(message, category) {
  log('info', `ℹ️  ${message}`, category);
}

// Test result tracking
function addTestResult(category, testName, passed, message, details = null) {
  const result = {
    name: testName,
    passed,
    message,
    details,
    timestamp: new Date().toISOString()
  };
  
  validationResults[category].tests.push(result);
  
  if (passed) {
    validationResults[category].passed++;
    logSuccess(`${testName}: ${message}`, category);
  } else {
    validationResults[category].failed++;
    logError(`${testName}: ${message}`, category);
  }
  
  return passed;
}

// Infrastructure validation
async function validateInfrastructure() {
  logInfo('Starting infrastructure validation...', 'infrastructure');
  
  try {
    // Validate Lambda functions
    const expectedFunctions = [
      `ataraxia-auth-${config.environment}`,
      `ataraxia-therapist-${config.environment}`,
      `ataraxia-client-${config.environment}`,
      `ataraxia-verification-${config.environment}`
    ];
    
    for (const functionName of expectedFunctions) {
      try {
        const func = await lambda.getFunction({ FunctionName: functionName }).promise();
        addTestResult('infrastructure', `Lambda Function: ${functionName}`, true, 
          `Function exists with runtime ${func.Configuration.Runtime}`);
      } catch (error) {
        addTestResult('infrastructure', `Lambda Function: ${functionName}`, false, 
          `Function not found: ${error.message}`);
      }
    }
    
    // Validate Cognito User Pool
    if (config.cognitoUserPoolId) {
      try {
        const userPool = await cognito.describeUserPool({ 
          UserPoolId: config.cognitoUserPoolId 
        }).promise();
        addTestResult('infrastructure', 'Cognito User Pool', true, 
          `User pool exists: ${userPool.UserPool.Name}`);
      } catch (error) {
        addTestResult('infrastructure', 'Cognito User Pool', false, 
          `User pool validation failed: ${error.message}`);
      }
    }
    
    // Validate API Gateway
    if (config.apiBaseUrl) {
      try {
        const response = await axios.get(`${config.apiBaseUrl}api/auth/login`, {
          validateStatus: () => true, // Accept any status code
          timeout: 10000
        });
        
        const isValid = response.status === 405 || response.status === 400 || response.status === 200;
        addTestResult('infrastructure', 'API Gateway', isValid, 
          `API Gateway responding with status ${response.status}`);
      } catch (error) {
        addTestResult('infrastructure', 'API Gateway', false, 
          `API Gateway not accessible: ${error.message}`);
      }
    }
    
  } catch (error) {
    logError(`Infrastructure validation error: ${error.message}`, 'infrastructure');
  }
}

// Database validation
async function validateDatabase() {
  logInfo('Starting database validation...', 'database');
  
  try {
    // Test database connection
    const client = await pool.connect();
    addTestResult('database', 'Database Connection', true, 'Successfully connected to database');
    
    // Validate enhanced therapist table schema
    const therapistColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'therapists' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    const expectedColumns = [
      'clinical_specialties', 'therapeutic_modalities', 'session_formats',
      'insurance_panels_accepted', 'new_clients_capacity', 'max_caseload_capacity',
      'emergency_same_day_capacity', 'weekly_schedule', 'session_durations'
    ];
    
    const existingColumns = therapistColumns.rows.map(row => row.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));
    
    addTestResult('database', 'Enhanced Therapist Schema', missingColumns.length === 0,
      missingColumns.length === 0 
        ? 'All enhanced fields present in therapists table'
        : `Missing columns: ${missingColumns.join(', ')}`,
      { existingColumns: existingColumns.length, expectedColumns: expectedColumns.length }
    );
    
    // Validate JSONB indexes
    const indexes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'therapists' AND indexdef LIKE '%gin%'
    `);
    
    addTestResult('database', 'JSONB Indexes', indexes.rows.length > 0,
      `Found ${indexes.rows.length} GIN indexes for JSONB fields`);
    
    // Validate verification system tables
    const verificationTables = [
      'temp_therapist_registrations',
      'verification_workflow_log',
      'therapist_verifications'
    ];
    
    for (const tableName of verificationTables) {
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName]);
      
      addTestResult('database', `Table: ${tableName}`, tableExists.rows[0].exists,
        tableExists.rows[0].exists ? 'Table exists' : 'Table missing');
    }
    
    client.release();
    
  } catch (error) {
    addTestResult('database', 'Database Connection', false, 
      `Database validation failed: ${error.message}`);
  }
}

// API endpoint validation
async function validateApiEndpoints() {
  logInfo('Starting API endpoint validation...', 'api');
  
  if (!config.apiBaseUrl) {
    addTestResult('api', 'API Base URL', false, 'API base URL not configured');
    return;
  }
  
  const endpoints = [
    { method: 'GET', path: '/api/therapist', expectedStatus: [200, 401] },
    { method: 'GET', path: '/api/therapist/search', expectedStatus: [200, 401] },
    { method: 'POST', path: '/api/auth/login', expectedStatus: [400, 401] },
    { method: 'POST', path: '/api/auth/register', expectedStatus: [400, 401] },
    { method: 'GET', path: '/api/verification/status/test', expectedStatus: [404, 401] }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${config.apiBaseUrl}${endpoint.path}`,
        validateStatus: () => true,
        timeout: 10000
      });
      
      const isValid = endpoint.expectedStatus.includes(response.status);
      addTestResult('api', `${endpoint.method} ${endpoint.path}`, isValid,
        `Responded with status ${response.status}${isValid ? ' (expected)' : ' (unexpected)'}`);
        
    } catch (error) {
      addTestResult('api', `${endpoint.method} ${endpoint.path}`, false,
        `Request failed: ${error.message}`);
    }
  }
}

// Enhanced features validation
async function validateEnhancedFeatures() {
  logInfo('Starting enhanced features validation...', 'features');
  
  try {
    const client = await pool.connect();
    
    // Test JSONB queries (clinical specialties)
    const jsonbQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM therapists 
      WHERE clinical_specialties ? 'anxiety'
    `);
    
    addTestResult('features', 'JSONB Specialty Query', true,
      'JSONB specialty queries working correctly');
    
    // Test complex search query
    const complexQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      WHERE u.role = 'therapist' 
        AND u.account_status = 'active'
        AND tp.new_clients_capacity > 0
        AND tp.session_formats ? 'video'
    `);
    
    addTestResult('features', 'Complex Search Query', true,
      `Complex search query executed successfully (${complexQuery.rows[0].count} results)`);
    
    // Test insurance panel queries
    const insuranceQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM therapists 
      WHERE insurance_panels_accepted @> '["Aetna"]'::jsonb
         OR medicaid_acceptance = true
         OR medicare_acceptance = true
    `);
    
    addTestResult('features', 'Insurance Panel Query', true,
      'Insurance panel queries working correctly');
    
    // Test capacity calculations
    const capacityQuery = await client.query(`
      SELECT 
        AVG(new_clients_capacity) as avg_capacity,
        COUNT(*) as total_therapists,
        COUNT(*) FILTER (WHERE new_clients_capacity > 0) as accepting_new
      FROM therapists
    `);
    
    const capacityData = capacityQuery.rows[0];
    addTestResult('features', 'Capacity Calculations', true,
      `Capacity tracking working: ${capacityData.accepting_new}/${capacityData.total_therapists} accepting new clients`);
    
    client.release();
    
  } catch (error) {
    addTestResult('features', 'Enhanced Features', false,
      `Feature validation failed: ${error.message}`);
  }
}

// Performance validation
async function validatePerformance() {
  logInfo('Starting performance validation...', 'performance');
  
  if (!config.apiBaseUrl) {
    addTestResult('performance', 'API Performance', false, 'API base URL not configured');
    return;
  }
  
  // Test API response times
  const performanceTests = [
    { name: 'Basic Therapist List', path: '/api/therapist', maxTime: 2000 },
    { name: 'Advanced Search', path: '/api/therapist/search?specialty=anxiety&limit=10', maxTime: 3000 },
    { name: 'Auth Endpoint', path: '/api/auth/login', maxTime: 1000 }
  ];
  
  for (const test of performanceTests) {
    try {
      const startTime = Date.now();
      
      await axios.get(`${config.apiBaseUrl}${test.path}`, {
        validateStatus: () => true,
        timeout: test.maxTime + 1000
      });
      
      const responseTime = Date.now() - startTime;
      const passed = responseTime <= test.maxTime;
      
      addTestResult('performance', test.name, passed,
        `Response time: ${responseTime}ms (max: ${test.maxTime}ms)`,
        { responseTime, maxTime: test.maxTime });
        
    } catch (error) {
      addTestResult('performance', test.name, false,
        `Performance test failed: ${error.message}`);
    }
  }
  
  // Test database query performance
  try {
    const client = await pool.connect();
    
    const startTime = Date.now();
    await client.query(`
      SELECT u.id, u.first_name, u.last_name, tp.clinical_specialties
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      WHERE u.role = 'therapist' 
        AND tp.clinical_specialties ? 'anxiety'
      LIMIT 20
    `);
    const queryTime = Date.now() - startTime;
    
    addTestResult('performance', 'Database Query Performance', queryTime <= 500,
      `JSONB query time: ${queryTime}ms (max: 500ms)`,
      { queryTime, maxTime: 500 });
    
    client.release();
    
  } catch (error) {
    addTestResult('performance', 'Database Query Performance', false,
      `Database performance test failed: ${error.message}`);
  }
}

// Security validation
async function validateSecurity() {
  logInfo('Starting security validation...', 'security');
  
  // Test CORS headers
  if (config.apiBaseUrl) {
    try {
      const response = await axios.options(`${config.apiBaseUrl}api/auth/login`, {
        headers: { 'Origin': 'https://example.com' },
        validateStatus: () => true
      });
      
      const hasCors = response.headers['access-control-allow-origin'] !== undefined;
      addTestResult('security', 'CORS Configuration', hasCors,
        hasCors ? 'CORS headers present' : 'CORS headers missing');
        
    } catch (error) {
      addTestResult('security', 'CORS Configuration', false,
        `CORS test failed: ${error.message}`);
    }
  }
  
  // Test authentication requirement
  if (config.apiBaseUrl) {
    try {
      const response = await axios.get(`${config.apiBaseUrl}api/therapist`, {
        validateStatus: () => true
      });
      
      const requiresAuth = response.status === 401 || response.status === 403;
      addTestResult('security', 'Authentication Requirement', requiresAuth,
        requiresAuth ? 'Protected endpoints require authentication' : 'Endpoints may be unprotected');
        
    } catch (error) {
      addTestResult('security', 'Authentication Requirement', false,
        `Auth test failed: ${error.message}`);
    }
  }
  
  // Validate Cognito security settings
  if (config.cognitoUserPoolId) {
    try {
      const userPool = await cognito.describeUserPool({ 
        UserPoolId: config.cognitoUserPoolId 
      }).promise();
      
      const policies = userPool.UserPool.Policies;
      const hasStrongPassword = policies && policies.PasswordPolicy && 
        policies.PasswordPolicy.MinimumLength >= 8;
      
      addTestResult('security', 'Password Policy', hasStrongPassword,
        hasStrongPassword ? 'Strong password policy configured' : 'Weak password policy');
        
    } catch (error) {
      addTestResult('security', 'Password Policy', false,
        `Password policy check failed: ${error.message}`);
    }
  }
}

// Generate validation report
function generateReport() {
  const totalTests = Object.values(validationResults).reduce((sum, category) => 
    sum + category.passed + category.failed, 0);
  const totalPassed = Object.values(validationResults).reduce((sum, category) => 
    sum + category.passed, 0);
  const totalFailed = Object.values(validationResults).reduce((sum, category) => 
    sum + category.failed, 0);
  
  const report = {
    summary: {
      totalTests,
      totalPassed,
      totalFailed,
      successRate: Math.round((totalPassed / totalTests) * 100),
      timestamp: new Date().toISOString(),
      environment: config.environment,
      deploymentValid: totalFailed === 0
    },
    categories: validationResults,
    configuration: config
  };
  
  // Write report to file
  const reportFile = `validation-report-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  // Generate markdown report
  const markdownReport = generateMarkdownReport(report);
  const markdownFile = `validation-report-${Date.now()}.md`;
  fs.writeFileSync(markdownFile, markdownReport);
  
  return { report, reportFile, markdownFile };
}

// Generate markdown report
function generateMarkdownReport(report) {
  const { summary, categories } = report;
  
  let markdown = `# Enhanced Therapist Service Validation Report

## Summary
- **Total Tests**: ${summary.totalTests}
- **Passed**: ${summary.totalPassed} ✅
- **Failed**: ${summary.totalFailed} ❌
- **Success Rate**: ${summary.successRate}%
- **Environment**: ${summary.environment}
- **Deployment Status**: ${summary.deploymentValid ? '✅ VALID' : '❌ INVALID'}
- **Timestamp**: ${summary.timestamp}

## Category Results

`;

  Object.entries(categories).forEach(([categoryName, category]) => {
    const categoryTitle = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
    markdown += `### ${categoryTitle}
- **Passed**: ${category.passed}
- **Failed**: ${category.failed}
- **Success Rate**: ${Math.round((category.passed / (category.passed + category.failed)) * 100)}%

#### Test Details
`;

    category.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      markdown += `- ${status} **${test.name}**: ${test.message}\n`;
      if (test.details) {
        markdown += `  - Details: ${JSON.stringify(test.details)}\n`;
      }
    });
    
    markdown += '\n';
  });
  
  markdown += `## Configuration
\`\`\`json
${JSON.stringify(report.configuration, null, 2)}
\`\`\`

## Recommendations

`;

  if (summary.deploymentValid) {
    markdown += `✅ **Deployment is valid and ready for use!**

### Next Steps:
1. Begin Phase 2: Client Service Enhancement
2. Monitor performance metrics in CloudWatch
3. Set up automated health checks
4. Configure production monitoring alerts
`;
  } else {
    markdown += `❌ **Deployment validation failed. Please address the following issues:**

`;
    Object.entries(categories).forEach(([categoryName, category]) => {
      if (category.failed > 0) {
        markdown += `### ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Issues:\n`;
        category.tests.filter(test => !test.passed).forEach(test => {
          markdown += `- ${test.name}: ${test.message}\n`;
        });
        markdown += '\n';
      }
    });
  }
  
  return markdown;
}

// Main validation function
async function runValidation() {
  console.log('🔍 Enhanced Therapist Service Deployment Validation');
  console.log('=' .repeat(60));
  console.log(`Environment: ${config.environment}`);
  console.log(`API Base URL: ${config.apiBaseUrl || 'Not configured'}`);
  console.log(`Cognito User Pool: ${config.cognitoUserPoolId || 'Not configured'}`);
  console.log('');
  
  try {
    await validateInfrastructure();
    await validateDatabase();
    await validateApiEndpoints();
    await validateEnhancedFeatures();
    await validatePerformance();
    await validateSecurity();
    
    const { report, reportFile, markdownFile } = generateReport();
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 VALIDATION SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.totalPassed} ✅`);
    console.log(`Failed: ${report.summary.totalFailed} ❌`);
    console.log(`Success Rate: ${report.summary.successRate}%`);
    console.log(`Deployment Status: ${report.summary.deploymentValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log('');
    console.log(`📄 Reports generated:`);
    console.log(`  - JSON: ${reportFile}`);
    console.log(`  - Markdown: ${markdownFile}`);
    
    if (report.summary.deploymentValid) {
      console.log('\n🎉 Enhanced Therapist Service deployment is valid and ready!');
      console.log('✅ Proceed with Phase 2: Client Service Enhancement');
    } else {
      console.log('\n❌ Deployment validation failed. Please address the issues above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed with error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run validation if called directly
if (require.main === module) {
  runValidation().catch(console.error);
}

module.exports = { runValidation, validateInfrastructure, validateDatabase, validateApiEndpoints };