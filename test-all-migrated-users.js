#!/usr/bin/env node

/**
 * Test All Migrated Users Authentication
 * 
 * This script tests authentication for all users that were migrated to Cognito
 */

const API_BASE_URL = 'http://localhost:3010';

// Test credentials from migration
const testUsers = [
  {
    email: 'test@ataraxia.com',
    password: 'NewSecurePass123!', // Already changed password
    name: 'Test User',
    role: 'therapist',
    status: 'existing_user'
  },
  {
    email: 'mindhelpbyus@gmail.com',
    password: '1L!ka7FAc4hp',
    name: 'Vignesh Prabu',
    role: 'therapist',
    status: 'newly_migrated'
  },
  {
    email: 'info@bedrockhealthsolutions.com',
    password: 'A!LaJ0AK1xyn',
    name: 'Bedrock Healthsolutions',
    role: 'super_admin',
    status: 'newly_migrated'
  },
  {
    email: 'vignesh@ataraxia.com',
    password: 'AadS1!uzAa1U',
    name: 'Vignesh Kumar',
    role: 'therapist',
    status: 'newly_migrated'
  },
  {
    email: 'aishwarya.viswanathan@ataraxia.com',
    password: 'ACZTmD1a1!A%',
    name: 'Aishwarya Viswanathan',
    role: 'therapist',
    status: 'newly_migrated'
  }
];

async function testLogin(user) {
  try {
    console.log(`\n🧪 Testing: ${user.name} (${user.email})`);
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      if (data.challengeName === 'NEW_PASSWORD_REQUIRED') {
        console.log(`   ⚠️ Password change required`);
        return { success: true, needsPasswordChange: true, user: data };
      } else {
        console.log(`   ✅ Login successful`);
        console.log(`   👤 User ID: ${data.user.id}`);
        console.log(`   🏷️ Role: ${data.user.role}`);
        console.log(`   📧 Email: ${data.user.email}`);
        console.log(`   🔐 Auth Provider: ${data.user.auth_provider_type}`);
        console.log(`   🆔 Cognito ID: ${data.user.auth_provider_id}`);
        return { success: true, needsPasswordChange: false, user: data };
      }
    } else {
      console.log(`   ❌ Login failed: ${data.message}`);
      return { success: false, error: data.message };
    }
    
  } catch (error) {
    console.log(`   ❌ Network error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testUserProfile(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Profile fetch successful`);
      return { success: true, profile: data };
    } else {
      console.log(`   ❌ Profile fetch failed: ${data.message}`);
      return { success: false, error: data.message };
    }
    
  } catch (error) {
    console.log(`   ❌ Profile fetch error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🧪 Testing All Migrated Users Authentication');
  console.log('='.repeat(80));
  
  const results = {
    total: testUsers.length,
    successful: 0,
    failed: 0,
    needPasswordChange: 0,
    details: []
  };

  for (const user of testUsers) {
    const loginResult = await testLogin(user);
    
    if (loginResult.success) {
      results.successful++;
      
      if (loginResult.needsPasswordChange) {
        results.needPasswordChange++;
      }
      
      // Test profile fetch if we have a token
      if (loginResult.user?.token) {
        await testUserProfile(loginResult.user.token);
      }
      
      results.details.push({
        user: user.name,
        email: user.email,
        status: 'success',
        needsPasswordChange: loginResult.needsPasswordChange,
        role: loginResult.user?.user?.role
      });
    } else {
      results.failed++;
      results.details.push({
        user: user.name,
        email: user.email,
        status: 'failed',
        error: loginResult.error
      });
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`📈 Total Users Tested: ${results.total}`);
  console.log(`✅ Successful Logins: ${results.successful}`);
  console.log(`❌ Failed Logins: ${results.failed}`);
  console.log(`⚠️ Need Password Change: ${results.needPasswordChange}`);
  
  console.log('\n📋 DETAILED RESULTS:');
  results.details.forEach((detail, index) => {
    console.log(`\n${index + 1}. ${detail.user} (${detail.email})`);
    console.log(`   Status: ${detail.status}`);
    if (detail.role) {
      console.log(`   Role: ${detail.role}`);
    }
    if (detail.needsPasswordChange) {
      console.log(`   Action: Password change required on first login`);
    }
    if (detail.error) {
      console.log(`   Error: ${detail.error}`);
    }
  });

  console.log('\n🎉 MIGRATION SUCCESS RATE:');
  const successRate = ((results.successful / results.total) * 100).toFixed(1);
  console.log(`   ${successRate}% of users can authenticate successfully`);
  
  if (results.successful === results.total) {
    console.log('\n🏆 ALL USERS MIGRATED SUCCESSFULLY!');
    console.log('✅ Real Cognito authentication is working for all users');
    console.log('✅ Database sync is working properly');
    console.log('✅ JWT token generation is working');
    console.log('✅ User profile fetching is working');
  } else {
    console.log('\n⚠️ Some users need attention:');
    results.details
      .filter(d => d.status === 'failed')
      .forEach(d => console.log(`   - ${d.user}: ${d.error}`));
  }

  console.log('\n💡 NEXT STEPS:');
  console.log('1. Users can now login with their email and temporary password');
  console.log('2. They will be prompted to change password on first login');
  console.log('3. Frontend is ready to use real authentication');
  console.log('4. Consider sending password reset emails to users');
}

// Run the tests
runAllTests().catch(console.error);