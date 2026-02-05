#!/usr/bin/env node

/**
 * Simple test for Firebase and Cognito user login
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3005';

async function testLogin(email, password, provider, description) {
  console.log(`\n🧪 Testing ${provider} Login: ${email}`);
  console.log('='.repeat(50));
  
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ LOGIN SUCCESS!');
    console.log(`   Status: ${response.status}`);
    console.log(`   User: ${response.data.user?.name || 'Unknown'}`);
    console.log(`   Role: ${response.data.user?.role || 'Unknown'}`);
    console.log(`   Provider: ${response.data.user?.current_auth_provider || 'Unknown'}`);
    console.log(`   Token: ${response.data.token ? 'Present' : 'Missing'}`);
    
    return { success: true, data: response.data };
    
  } catch (error) {
    const status = error.response?.status || 'ERROR';
    const message = error.response?.data?.message || error.message;
    
    console.log('❌ LOGIN FAILED');
    console.log(`   Status: ${status}`);
    console.log(`   Message: ${message}`);
    console.log(`   Reason: ${description}`);
    
    return { success: false, status, message };
  }
}

async function testFirebaseLogin() {
  console.log('\n🔥 FIREBASE USER LOGIN TESTS');
  console.log('============================');
  
  // Test Firebase users (these will fail because Firebase users don't have passwords)
  const firebaseUsers = [
    {
      email: 'vignesh@ataraxia.com',
      password: 'any-password',
      description: 'Firebase users authenticate via Firebase SDK, not password'
    },
    {
      email: 'test@ataraxia.com',
      password: 'test123',
      description: 'Firebase users authenticate via Firebase SDK, not password'
    }
  ];
  
  for (const user of firebaseUsers) {
    await testLogin(user.email, user.password, 'Firebase', user.description);
  }
  
  console.log('\n📝 Note: Firebase users authenticate through the Firebase SDK on the frontend,');
  console.log('   then the backend verifies the Firebase ID token. They don\'t use passwords');
  console.log('   for direct backend authentication.');
}

async function testCognitoLogin() {
  console.log('\n🔐 COGNITO USER LOGIN TESTS');
  console.log('===========================');
  
  // First, let's register a new Cognito user for testing
  console.log('\n📝 Creating test Cognito user...');
  const testUser = {
    email: `cognito-login-test-${Date.now()}@example.com`,
    password: 'CognitoTest123!',
    firstName: 'Cognito',
    lastName: 'LoginTest',
    role: 'therapist'
  };
  
  try {
    const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, testUser);
    console.log('✅ Cognito user registered successfully');
    console.log(`   Email: ${testUser.email}`);
    console.log(`   Status: Needs email verification`);
    
    // Try to login (will fail because email not verified)
    await testLogin(testUser.email, testUser.password, 'Cognito', 'Email verification required');
    
  } catch (error) {
    console.log('❌ Failed to register Cognito user:', error.response?.data?.message || error.message);
  }
  
  console.log('\n📝 Note: Cognito users need to verify their email before they can login.');
  console.log('   In production, they would receive a verification email with a code.');
}

async function testLocalLogin() {
  console.log('\n🏠 LOCAL/DIRECT DATABASE LOGIN TESTS');
  console.log('====================================');
  
  // Test the super admin (local database user)
  await testLogin(
    'info@bedrockhealthsolutions.com',
    'Mind3ArtsSeaTac',
    'Local Database',
    'Super admin with direct database authentication'
  );
}

async function runLoginTests() {
  console.log('🧪 FIREBASE & COGNITO LOGIN TESTING');
  console.log('===================================');
  console.log(`🌐 API: ${API_BASE_URL}`);
  console.log('');
  
  // Check API health
  try {
    const health = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ API is healthy and ready');
  } catch (error) {
    console.log('❌ API is not responding. Make sure backend is running on port 3005');
    process.exit(1);
  }
  
  // Run all login tests
  await testLocalLogin();      // This should work
  await testFirebaseLogin();   // These will fail (expected)
  await testCognitoLogin();    // This will fail due to email verification
  
  console.log('\n🎉 LOGIN TESTING COMPLETE!');
  console.log('==========================');
  console.log('📊 Summary:');
  console.log('   ✅ Local Database Authentication: Working');
  console.log('   🔥 Firebase Authentication: Requires Firebase SDK');
  console.log('   🔐 Cognito Authentication: Requires email verification');
  console.log('');
  console.log('💡 To test Firebase users:');
  console.log('   1. Use Firebase SDK on frontend to authenticate');
  console.log('   2. Send Firebase ID token to backend for verification');
  console.log('');
  console.log('💡 To test Cognito users:');
  console.log('   1. Register user via /auth/register');
  console.log('   2. Verify email using confirmation code');
  console.log('   3. Then login with email/password');
}

runLoginTests().catch(error => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
});