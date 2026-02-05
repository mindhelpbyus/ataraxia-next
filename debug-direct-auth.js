#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function debugDirectAuth() {
  const prisma = new PrismaClient();
  const email = 'info@bedrockhealthsolutions.com';

  try {
    console.log('🔍 Debugging direct auth detection...\n');

    // Check user details
    const user = await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        password_hash: true,
        current_auth_provider: true
      }
    });

    console.log('👤 User Details:');
    console.log(`  Email: ${user?.email}`);
    console.log(`  Role: ${user?.role}`);
    console.log(`  Provider: ${user?.current_auth_provider}`);
    console.log(`  Has Password Hash: ${user?.password_hash ? 'Yes' : 'No'}`);

    // Check auth provider mapping
    const mapping = await prisma.auth_provider_mapping.findFirst({
      where: { 
        provider_email: email 
      }
    });

    console.log('\n🔗 Auth Provider Mapping:');
    if (mapping) {
      console.log(`  Provider Type: ${mapping.provider_type}`);
      console.log(`  Provider UID: ${mapping.provider_uid}`);
      console.log(`  Is Primary: ${mapping.is_primary}`);
    } else {
      console.log('  ❌ No auth provider mapping found');
    }

    // Simulate shouldUseDirectAuth logic (UPDATED)
    console.log('\n🧪 Direct Auth Check Logic (Updated):');
    console.log(`  1. User exists: ${user ? 'Yes' : 'No'}`);
    console.log(`  2. Role is super_admin: ${user?.role === 'super_admin' ? 'Yes' : 'No'}`);
    console.log(`  3. Has password hash: ${user?.password_hash ? 'Yes' : 'No'}`);
    console.log(`  4. Current auth provider is 'local': ${user?.current_auth_provider === 'local' ? 'Yes' : 'No'}`);
    
    const shouldUseDirect = user && 
                           user.role === 'super_admin' && 
                           user.password_hash && 
                           user.current_auth_provider === 'local';
    
    console.log(`\n✅ Should Use Direct Auth: ${shouldUseDirect ? 'YES' : 'NO'}`);

    if (!shouldUseDirect) {
      console.log('\n❌ Reasons why direct auth is not being used:');
      if (!user) console.log('  - User not found');
      if (user && user.role !== 'super_admin') console.log('  - User is not super_admin');
      if (user && !user.password_hash) console.log('  - User has no password hash');
      if (user && user.current_auth_provider !== 'local') console.log(`  - Current auth provider is '${user.current_auth_provider}', not 'local'`);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugDirectAuth();