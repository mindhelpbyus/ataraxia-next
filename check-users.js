#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function checkUsers() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking users in database...\n');

    // Get all users
    const users = await prisma.users.findMany({
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        current_auth_provider: true,
        account_status: true,
        is_verified: true,
        email_verified: true
      },
      orderBy: { id: 'desc' },
      take: 10
    });

    console.log('👥 Recent Users:');
    users.forEach(user => {
      console.log(`  ID: ${user.id} | ${user.email} | ${user.role} | Provider: ${user.current_auth_provider} | Status: ${user.account_status} | Verified: ${user.email_verified}`);
    });

    // Get auth provider mappings
    console.log('\n🔗 Auth Provider Mappings:');
    const mappings = await prisma.auth_provider_mapping.findMany({
      select: {
        user_id: true,
        provider_type: true,
        provider_uid: true,
        provider_email: true,
        is_primary: true
      },
      orderBy: { user_id: 'desc' },
      take: 10
    });

    mappings.forEach(mapping => {
      console.log(`  User: ${mapping.user_id} | Provider: ${mapping.provider_type} | UID: ${mapping.provider_uid} | Primary: ${mapping.is_primary}`);
    });

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();