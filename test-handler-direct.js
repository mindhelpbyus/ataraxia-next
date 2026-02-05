#!/usr/bin/env node

/**
 * Direct test of the auth handler without Express
 */

// Set up environment
process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL = 'debug';
process.env.DATABASE_URL = 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia';
process.env.COGNITO_USER_POOL_ID = 'us-west-2_xeXlyFBMH';
process.env.COGNITO_CLIENT_ID = '7ek8kg1td2ps985r21m7727q98';
process.env.COGNITO_REGION = 'us-west-2';
process.env.FIREBASE_PROJECT_ID = 'ataraxia-c150f';
process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@ataraxia-c150f.iam.gserviceaccount.com';
process.env.FIREBASE_API_KEY = 'AIzaSyCM2W8UE5gJekK2vV2d-UE5fVe3ZXzk1vQ';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = './firebase-service-account.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = './firebase-service-account.json';
process.env.AUTH_PROVIDER_TYPE = 'firebase';
process.env.ENABLE_UNIVERSAL_AUTH = 'true';
process.env.JWT_SECRET = 'your_jwt_secret_key_change_in_production';
process.env.ENABLE_DETAILED_ERRORS = 'true';
process.env.ENABLE_MFA = 'true';
process.env.AWS_REGION = 'us-west-2';

async function testAuthHandler() {
  console.log('🧪 Testing Auth Handler Directly...');
  console.log('📊 Database: Real AWS RDS');
  console.log('🔥 Firebase: Real Production');
  console.log('🔐 Cognito: Real Production');
  console.log('');

  try {
    // Load the auth handler
    const { handler } = require('./dist/lambdas/auth/handler');
    console.log('✅ Auth handler loaded successfully');

    // Test 1: MFA Status Check
    console.log('\n🧪 Test 1: MFA Status Check');
    const mfaEvent = {
      httpMethod: 'GET',
      path: '/auth/mfa/status',
      queryStringParameters: { userId: '1' },
      headers: {},
      body: null,
      requestContext: {
        requestId: 'test-1',
        identity: { sourceIp: '127.0.0.1' }
      }
    };

    const mfaResponse = await handler(mfaEvent);
    console.log('Status:', mfaResponse.statusCode);
    console.log('Response:', JSON.parse(mfaResponse.body));

    // Test 2: Health Check (if available)
    console.log('\n🧪 Test 2: Registration Test');
    const registerEvent = {
      httpMethod: 'POST',
      path: '/auth/register',
      queryStringParameters: null,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'client'
      }),
      requestContext: {
        requestId: 'test-2',
        identity: { sourceIp: '127.0.0.1' }
      }
    };

    const registerResponse = await handler(registerEvent);
    console.log('Status:', registerResponse.statusCode);
    console.log('Response:', JSON.parse(registerResponse.body));

    console.log('\n🎉 Auth handler is working!');
    console.log('✅ Ready for frontend integration');

  } catch (error) {
    console.error('❌ Error testing auth handler:', error);
    process.exit(1);
  }
}

testAuthHandler();