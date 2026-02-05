#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function fixAuthProviderTypeConstraint() {
  const prisma = new PrismaClient();

  try {
    console.log('🔧 Fixing auth_provider_type constraint to allow local...\n');
    
    // Update auth_provider_type constraint to allow 'local'
    console.log('📝 Dropping existing constraint...');
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.users 
      DROP CONSTRAINT IF EXISTS chk_users_auth_provider_type
    `;
    
    console.log('📝 Adding updated constraint...');
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.users 
      ADD CONSTRAINT chk_users_auth_provider_type 
      CHECK (auth_provider_type IN ('firebase', 'cognito', 'local'))
    `;
    
    console.log('✅ auth_provider_type constraint updated successfully!');
    console.log('📋 Valid auth_provider_type values now: firebase, cognito, local');
    
    // Now update the super admin user
    console.log('\n🔧 Updating super admin auth_provider_type...');
    const result = await prisma.users.update({
      where: { email: 'info@bedrockhealthsolutions.com' },
      data: { 
        auth_provider_type: 'local'
      },
      select: {
        id: true,
        email: true,
        auth_provider_type: true,
        current_auth_provider: true
      }
    });

    console.log('✅ Super admin updated successfully!');
    console.log(`📧 Email: ${result.email}`);
    console.log(`🔐 auth_provider_type: ${result.auth_provider_type}`);
    console.log(`🔐 current_auth_provider: ${result.current_auth_provider}`);
    console.log('\n✅ All auth provider data is now consistent!');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixAuthProviderTypeConstraint();