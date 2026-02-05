#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function fixSuperAdminProvider() {
  const prisma = new PrismaClient();
  const email = 'info@bedrockhealthsolutions.com';

  try {
    console.log('🔧 Fixing super admin auth provider inconsistency...\n');

    // Update auth_provider_type to match current_auth_provider
    const result = await prisma.users.update({
      where: { email },
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

    console.log('✅ Super admin auth provider updated successfully!');
    console.log(`📧 Email: ${result.email}`);
    console.log(`🔐 auth_provider_type: ${result.auth_provider_type}`);
    console.log(`🔐 current_auth_provider: ${result.current_auth_provider}`);
    console.log(`🆔 User ID: ${result.id}`);
    
    console.log('\n✅ Auth provider data is now consistent!');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixSuperAdminProvider();