#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function checkSuperAdmin() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking super admin user...\n');

    // Find super admin user
    const superAdmin = await prisma.users.findUnique({
      where: { email: 'info@bedrockhealthsolutions.com' },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        current_auth_provider: true,
        account_status: true,
        is_verified: true,
        email_verified: true,
        auth_provider_id: true,
        password_hash: true,
        created_at: true
      }
    });

    if (superAdmin) {
      console.log('👑 Super Admin Found:');
      console.log(`  ID: ${superAdmin.id}`);
      console.log(`  Email: ${superAdmin.email}`);
      console.log(`  Name: ${superAdmin.first_name} ${superAdmin.last_name}`);
      console.log(`  Role: ${superAdmin.role}`);
      console.log(`  Provider: ${superAdmin.current_auth_provider}`);
      console.log(`  Status: ${superAdmin.account_status}`);
      console.log(`  Verified: ${superAdmin.email_verified}`);
      console.log(`  Auth Provider ID: ${superAdmin.auth_provider_id}`);
      console.log(`  Has Password Hash: ${superAdmin.password_hash ? 'Yes' : 'No'}`);
      console.log(`  Created: ${superAdmin.created_at}`);

      // Check auth provider mapping
      const mapping = await prisma.auth_provider_mapping.findFirst({
        where: { user_id: superAdmin.id }
      });

      console.log('\n🔗 Auth Provider Mapping:');
      if (mapping) {
        console.log(`  Provider Type: ${mapping.provider_type}`);
        console.log(`  Provider UID: ${mapping.provider_uid}`);
        console.log(`  Is Primary: ${mapping.is_primary}`);
      } else {
        console.log('  ❌ No auth provider mapping found');
      }

      // Check user roles
      const userRoles = await prisma.user_roles.findMany({
        where: { user_id: superAdmin.id },
        include: { role: true }
      });

      console.log('\n🎭 User Roles:');
      if (userRoles.length > 0) {
        userRoles.forEach(ur => {
          console.log(`  - ${ur.role.name} (${ur.role.description})`);
        });
      } else {
        console.log('  ❌ No roles assigned');
      }

    } else {
      console.log('❌ Super admin user not found');
    }

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSuperAdmin();