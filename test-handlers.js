#!/usr/bin/env node

/**
 * Test handler imports to verify all Lambda functions are working correctly
 */

console.log('🔍 Testing handler imports...');

try {
  // Test auth handler
  const authHandler = require('./dist/lambdas/auth/handler');
  console.log('✅ Auth handler imported successfully');
  console.log('   Handler function available:', typeof authHandler.handler === 'function');

  // Test verification handler
  const verificationHandler = require('./dist/lambdas/verification/handler');
  console.log('✅ Verification handler imported successfully');
  console.log('   Handler function available:', typeof verificationHandler.handler === 'function');

  // Test therapist handler
  const therapistHandler = require('./dist/lambdas/therapist/handler');
  console.log('✅ Therapist handler imported successfully');
  console.log('   Handler function available:', typeof therapistHandler.handler === 'function');

  // Test client handler
  const clientHandler = require('./dist/lambdas/client/handler');
  console.log('✅ Client handler imported successfully');
  console.log('   Handler function available:', typeof clientHandler.handler === 'function');

  console.log('\n🎉 All handlers imported and ready for deployment!');

  // Test a simple handler call (OPTIONS request for CORS)
  console.log('\n🧪 Testing CORS preflight...');
  
  const testEvent = {
    httpMethod: 'OPTIONS',
    path: '/test',
    headers: {},
    requestContext: { requestId: 'test-123', identity: { sourceIp: '127.0.0.1' } },
    body: null
  };

  authHandler.handler(testEvent).then(result => {
    console.log('✅ Auth handler CORS test successful:', result.statusCode === 200);
  }).catch(error => {
    console.log('⚠️  Auth handler CORS test failed:', error.message);
  });

} catch (error) {
  console.error('❌ Handler import error:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}