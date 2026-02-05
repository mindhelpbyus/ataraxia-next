#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function runLocalAuthMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🔧 Adding local auth provider support...');
    
    // Update users table constraint
    console.log('📝 Updating users table constraint...');
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.users 
      DROP CONSTRAINT IF EXISTS check_auth_provider
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.users 
      ADD CONSTRAINT check_auth_provider 
      CHECK (current_auth_provider IN ('firebase', 'cognito', 'local'))
    `;
    
    // Update auth_provider_mapping table constraint
    console.log('📝 Updating auth_provider_mapping table constraint...');
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.auth_provider_mapping 
      DROP CONSTRAINT IF EXISTS auth_provider_mapping_provider_type_check
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE ataraxia.auth_provider_mapping 
      ADD CONSTRAINT auth_provider_mapping_provider_type_check 
      CHECK (provider_type IN ('firebase', 'cognito', 'local'))
    `;
    
    console.log('✅ Local auth provider migration completed successfully!');
    console.log('📋 Valid auth providers now: firebase, cognito, local');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runLocalAuthMigration();