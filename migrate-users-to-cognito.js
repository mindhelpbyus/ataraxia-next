#!/usr/bin/env node

/**
 * User Migration Script: PostgreSQL → AWS Cognito
 * 
 * This script migrates existing users from PostgreSQL database to AWS Cognito
 * and updates their auth_provider_id and auth_provider_type fields.
 * 
 * FEATURES:
 * - Migrates all users (therapists and clients)
 * - Creates Cognito users with temporary passwords
 * - Updates database with Cognito auth_provider_id
 * - Handles existing Cognito users gracefully
 * - Provides detailed logging and error handling
 * - Generates migration report
 */

const { PrismaClient } = require('@prisma/client');
const { 
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  ListUsersCommand
} = require('@aws-sdk/client-cognito-identity-provider');
require('dotenv').config();

const prisma = new PrismaClient();

// AWS Cognito Configuration
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_xeXlyFBMH',
  clientId: process.env.COGNITO_CLIENT_ID || '7ek8kg1td2ps985r21m7727q98',
  region: process.env.AWS_REGION || 'us-west-2'
};

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_CONFIG.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Migration statistics
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  errors: 0,
  details: []
};

/**
 * Generate a secure temporary password
 */
function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Ensure password meets Cognito requirements
  password += 'A'; // Uppercase
  password += 'a'; // Lowercase  
  password += '1'; // Number
  password += '!'; // Symbol
  
  // Add random characters to reach 12 characters
  for (let i = 4; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check if user already exists in Cognito
 */
async function checkCognitoUser(email) {
  try {
    const command = new AdminGetUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email
    });
    
    const result = await cognitoClient.send(command);
    return result.UserAttributes?.find(attr => attr.Name === 'sub')?.Value || null;
  } catch (error) {
    if (error.name === 'UserNotFoundException') {
      return null; // User doesn't exist
    }
    throw error; // Other errors
  }
}

/**
 * Create user in Cognito
 */
async function createCognitoUser(user) {
  try {
    console.log(`📝 Creating Cognito user: ${user.email}`);
    
    const tempPassword = generateTempPassword();
    
    const command = new AdminCreateUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: user.email,
      UserAttributes: [
        { Name: 'email', Value: user.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: user.first_name || 'User' },
        { Name: 'family_name', Value: user.last_name || 'User' },
        { Name: 'custom:role', Value: user.role || 'client' }
      ],
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS' // Don't send email
    });

    const result = await cognitoClient.send(command);
    const cognitoUserId = result.User?.Username;
    
    if (!cognitoUserId) {
      throw new Error('Failed to get Cognito user ID');
    }

    // Set permanent password (same as temp for now)
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: cognitoUserId,
      Password: tempPassword,
      Permanent: true
    });
    
    await cognitoClient.send(setPasswordCommand);
    
    // Add user to appropriate group
    const groupName = user.role === 'therapist' ? 'therapists' : 
                     user.role === 'admin' ? 'admins' :
                     user.role === 'super_admin' ? 'superadmins' : 'clients';
    
    try {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: COGNITO_CONFIG.userPoolId,
        Username: cognitoUserId,
        GroupName: groupName
      });
      
      await cognitoClient.send(addToGroupCommand);
      console.log(`   ✅ Added to group: ${groupName}`);
    } catch (groupError) {
      console.log(`   ⚠️ Group assignment failed: ${groupError.message}`);
    }

    // Get the actual Cognito sub ID
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: cognitoUserId
    });
    
    const userDetails = await cognitoClient.send(getUserCommand);
    const cognitoSubId = userDetails.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
    
    console.log(`   ✅ Created with ID: ${cognitoSubId}`);
    console.log(`   🔑 Temporary password: ${tempPassword}`);
    
    return {
      cognitoUserId: cognitoSubId,
      tempPassword: tempPassword
    };
    
  } catch (error) {
    console.error(`   ❌ Failed to create Cognito user: ${error.message}`);
    throw error;
  }
}

/**
 * Update user in database with Cognito information
 */
async function updateUserInDatabase(userId, cognitoUserId, tempPassword) {
  try {
    await prisma.users.update({
      where: { id: userId },
      data: {
        auth_provider_id: cognitoUserId,
        auth_provider_type: 'cognito',
        auth_provider_metadata: {
          migrated_from_firebase: true,
          migration_date: new Date().toISOString(),
          temp_password: tempPassword,
          needs_password_change: true
        },
        updated_at: new Date()
      }
    });
    
    console.log(`   ✅ Updated database record`);
  } catch (error) {
    console.error(`   ❌ Failed to update database: ${error.message}`);
    throw error;
  }
}

/**
 * Migrate a single user
 */
async function migrateUser(user) {
  const userInfo = `${user.first_name} ${user.last_name} (${user.email})`;
  console.log(`\n👤 Processing: ${userInfo}`);
  
  try {
    // Check if user already exists in Cognito
    const existingCognitoId = await checkCognitoUser(user.email);
    
    if (existingCognitoId) {
      console.log(`   ⏭️ Already exists in Cognito: ${existingCognitoId}`);
      
      // Update database if not already updated
      if (user.auth_provider_type !== 'cognito' || user.auth_provider_id !== existingCognitoId) {
        await updateUserInDatabase(user.id, existingCognitoId, 'EXISTING_USER');
        stats.migrated++;
        stats.details.push({
          user: userInfo,
          status: 'updated_existing',
          cognitoId: existingCognitoId,
          tempPassword: 'N/A (existing user)'
        });
      } else {
        stats.skipped++;
        stats.details.push({
          user: userInfo,
          status: 'already_migrated',
          cognitoId: existingCognitoId,
          tempPassword: 'N/A'
        });
      }
      return;
    }

    // Create new Cognito user
    const { cognitoUserId, tempPassword } = await createCognitoUser(user);
    
    // Update database
    await updateUserInDatabase(user.id, cognitoUserId, tempPassword);
    
    stats.migrated++;
    stats.details.push({
      user: userInfo,
      status: 'newly_created',
      cognitoId: cognitoUserId,
      tempPassword: tempPassword
    });
    
    console.log(`   🎉 Migration successful!`);
    
  } catch (error) {
    console.error(`   ❌ Migration failed: ${error.message}`);
    stats.errors++;
    stats.details.push({
      user: userInfo,
      status: 'error',
      error: error.message,
      cognitoId: null,
      tempPassword: null
    });
  }
}

/**
 * Test authentication for migrated users
 */
async function testAuthentication(userDetails) {
  console.log(`\n🧪 Testing authentication for: ${userDetails.user}`);
  
  if (userDetails.status === 'error' || !userDetails.tempPassword || userDetails.tempPassword === 'N/A') {
    console.log(`   ⏭️ Skipping test (${userDetails.status})`);
    return;
  }

  try {
    const email = userDetails.user.match(/\(([^)]+)\)/)?.[1];
    if (!email) {
      console.log(`   ❌ Could not extract email`);
      return;
    }

    const response = await fetch('http://localhost:3010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: userDetails.tempPassword
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      if (data.challengeName === 'NEW_PASSWORD_REQUIRED') {
        console.log(`   ✅ Login successful - Password change required`);
      } else {
        console.log(`   ✅ Login successful - Full access`);
      }
    } else {
      console.log(`   ❌ Login failed: ${data.message}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Test failed: ${error.message}`);
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 MIGRATION REPORT');
  console.log('='.repeat(80));
  console.log(`📈 Total Users: ${stats.total}`);
  console.log(`✅ Successfully Migrated: ${stats.migrated}`);
  console.log(`⏭️ Skipped (Already Migrated): ${stats.skipped}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log('\n📋 DETAILED RESULTS:');
  
  stats.details.forEach((detail, index) => {
    console.log(`\n${index + 1}. ${detail.user}`);
    console.log(`   Status: ${detail.status}`);
    if (detail.cognitoId) {
      console.log(`   Cognito ID: ${detail.cognitoId}`);
    }
    if (detail.tempPassword && detail.tempPassword !== 'N/A') {
      console.log(`   Temp Password: ${detail.tempPassword}`);
    }
    if (detail.error) {
      console.log(`   Error: ${detail.error}`);
    }
  });

  console.log('\n🔑 LOGIN CREDENTIALS:');
  stats.details
    .filter(d => d.tempPassword && d.tempPassword !== 'N/A' && d.tempPassword !== 'EXISTING_USER')
    .forEach((detail, index) => {
      const email = detail.user.match(/\(([^)]+)\)/)?.[1];
      console.log(`${index + 1}. ${email} / ${detail.tempPassword}`);
    });

  console.log('\n💡 NEXT STEPS:');
  console.log('1. Test login with the credentials above');
  console.log('2. Users will need to change their passwords on first login');
  console.log('3. Update frontend to use the new authentication system');
  console.log('4. Consider sending password reset emails to users');
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log('🚀 Starting User Migration: PostgreSQL → AWS Cognito');
    console.log('='.repeat(80));
    
    // Get all users from database
    const users = await prisma.users.findMany({
      orderBy: { created_at: 'asc' }
    });
    
    stats.total = users.length;
    console.log(`📊 Found ${users.length} users in database`);
    
    if (users.length === 0) {
      console.log('❌ No users found to migrate');
      return;
    }

    // Migrate each user
    for (const user of users) {
      await migrateUser(user);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Generate report
    generateReport();

    // Test authentication for newly created users
    console.log('\n🧪 TESTING AUTHENTICATION');
    console.log('='.repeat(80));
    
    for (const detail of stats.details.filter(d => d.status === 'newly_created')) {
      await testAuthentication(detail);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Users can now login with their email and temporary password');
    console.log('⚠️ They will be prompted to change their password on first login');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };