#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function checkSuperAdminFull() {
  const prisma = new PrismaClient();
  const email = 'info@bedrockhealthsolutions.com';

  try {
    console.log('🔍 Full Super Admin Database Check...\n');

    // Get ALL auth-related fields for super admin
    const user = await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        password_hash: true,
        auth_provider_id: true,
        auth_provider_type: true,
        current_auth_provider: true,
        account_status: true,
        is_verified: true,
        email_verified: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      console.log('❌ Super admin user not found!');
      return;
    }

    console.log('👑 Super Admin User Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.first_name} ${user.last_name}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Account Status: ${user.account_status}`);
    console.log(`  Is Verified: ${user.is_verified}`);
    console.log(`  Email Verified: ${user.email_verified}`);
    console.log(`  Has Password Hash: ${user.password_hash ? 'Yes' : 'No'}`);
    console.log('');
    
    console.log('🔐 Auth Provider Details:');
    console.log(`  auth_provider_id: ${user.auth_provider_id}`);
    console.log(`  auth_provider_type: ${user.auth_provider_type}`);
    console.log(`  current_auth_provider: ${user.current_auth_provider}`);
    console.log('');

    console.log('📅 Timestamps:');
    console.log(`  Created: ${user.created_at}`);
    console.log(`  Updated: ${user.updated_at}`);
    console.log('');

    // Check auth provider mapping
    const mappings = await prisma.auth_provider_mapping.findMany({
      where: { 
        user_id: user.id
      }
    });

    console.log('🔗 Auth Provider Mappings:');
    if (mappings.length > 0) {
      mappings.forEach((mapping, index) => {
        console.log(`  Mapping ${index + 1}:`);
        console.log(`    Provider Type: ${mapping.provider_type}`);
        console.log(`    Provider UID: ${mapping.provider_uid}`);
        console.log(`    Provider Email: ${mapping.provider_email}`);
        console.log(`    Is Primary: ${mapping.is_primary}`);
        console.log(`    Created: ${mapping.created_at}`);
        console.log(`    Updated: ${mapping.updated_at}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No auth provider mappings found');
    }

    // Analysis
    console.log('🧪 Analysis:');
    console.log(`  Should use direct auth (role check): ${user.role === 'super_admin' ? 'Yes' : 'No'}`);
    console.log(`  Should use direct auth (password): ${user.password_hash ? 'Yes' : 'No'}`);
    console.log(`  Should use direct auth (current_auth_provider): ${user.current_auth_provider === 'local' ? 'Yes' : 'No'}`);
    
    const inconsistencies = [];
    if (user.auth_provider_type !== user.current_auth_provider) {
      inconsistencies.push(`auth_provider_type (${user.auth_provider_type}) != current_auth_provider (${user.current_auth_provider})`);
    }
    
    if (mappings.length > 0) {
      const primaryMapping = mappings.find(m => m.is_primary);
      if (primaryMapping && primaryMapping.provider_type !== user.current_auth_provider) {
        inconsistencies.push(`primary mapping type (${primaryMapping.provider_type}) != current_auth_provider (${user.current_auth_provider})`);
      }
    }

    if (inconsistencies.length > 0) {
      console.log('\n⚠️  Data Inconsistencies Found:');
      inconsistencies.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    } else {
      console.log('\n✅ All auth provider data is consistent');
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSuperAdminFull();