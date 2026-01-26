#!/usr/bin/env node

/**
 * Local Auth Testing Script
 * Tests the auth handler structure locally before deployment
 */

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.COGNITO_USER_POOL_ID = 'test-pool';
process.env.COGNITO_CLIENT_ID = 'test-client';
process.env.COGNITO_REGION = 'us-west-2';

const { handler } = require('../dist/lambdas/auth/handler.js');

// Mock API Gateway event
function createMockEvent(path, method, body = null) {
  return {
    path,
    httpMethod: method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'test-client/1.0'
    },
    body: body ? JSON.stringify(body) : null,
    requestContext: {
      requestId: 'test-' + Date.now(),
      identity: {
        sourceIp: '127.0.0.1'
      }
    }
  };
}

async function testAuthEndpoints() {
  console.log('🧪 Testing Ataraxia-Next Auth Handler Structure\n');

  try {
    // Test 1: CORS preflight
    console.log('1️⃣  Testing CORS Preflight...');
    const corsEvent = createMockEvent('/api/auth/register', 'OPTIONS');
    const corsResponse = await handler(corsEvent);
    console.log('CORS Response Status:', corsResponse.statusCode);
    console.log('CORS Headers:', corsResponse.headers);
    console.log('');

    // Test 2: Invalid route
    console.log('2️⃣  Testing Invalid Route...');
    const invalidEvent = createMockEvent('/api/auth/invalid', 'GET');
    const invalidResponse = await handler(invalidEvent);
    console.log('Invalid Route Response:', JSON.parse(invalidResponse.body));
    console.log('Status:', invalidResponse.statusCode);
    console.log('');

    // Test 3: Registration validation (will fail at Cognito, but tests structure)
    console.log('3️⃣  Testing Registration Validation...');
    const registerEvent = createMockEvent('/api/auth/register', 'POST', {
      // Missing required fields to test validation
      email: 'test@example.com'
    });

    const registerResponse = await handler(registerEvent);
    console.log('Register Validation Response:', JSON.parse(registerResponse.body));
    console.log('Status:', registerResponse.statusCode);
    console.log('');

    console.log('✅ Handler structure tests complete!');
    console.log('📝 Note: Database and Cognito operations will fail without real resources');
    console.log('🚀 Deploy with: npm run deploy:cognito');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('Prisma') || error.message.includes('database')) {
      console.log('💡 This is expected - database connection not available in test mode');
    } else {
      console.error(error.stack);
    }
  }
}

// Run tests
testAuthEndpoints();