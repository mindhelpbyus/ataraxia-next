#!/usr/bin/env node

/**
 * Check available test users in the database
 */

const { PrismaClient } = require('@prisma/client');

async function checkUsers() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia'
      }
    }
  });

  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        current_auth_provider: true,
        auth_provider_type: true,
        account_status: true,
        first_name: true,
        last_name: true
      },
      take: 15,
      orderBy: { id: 'asc' }
    });
    
    console.log('🔍 Available Test Users in Database:');
    console.log('=====================================');
    
    const providerCounts = { local: 0, firebase: 0, cognito: 0 };
    
    users.forEach(user => {
      console.log(`📧 ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.first_name} ${user.last_name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Provider: ${user.current_auth_provider}`);
      console.log(`   Status: ${user.account_status}`);
      console.log('');
      
      if (providerCounts[user.current_auth_provider] !== undefined) {
        providerCounts[user.current_auth_provider]++;
      }
    });
    
    console.log('📊 Provider Distribution:');
    console.log(`   Local: ${providerCounts.local} users`);
    console.log(`   Firebase: ${providerCounts.firebase} users`);
    console.log(`   Cognito: ${providerCounts.cognito} users`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();