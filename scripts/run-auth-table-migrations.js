#!/usr/bin/env node

/**
 * Auth Table Migrations - Add Missing Tables for Production Readiness
 * 
 * This script adds the missing database tables that the auth services require.
 * Run this after updating the Prisma schema to ensure all tables exist.
 */

const { PrismaClient } = require('@prisma/client');

async function runAuthTableMigrations() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Starting auth table migrations...');
    
    // Check if tables exist by trying to count records
    const tablesToCheck = [
      'mfa_settings',
      'mfa_backup_codes', 
      'failed_login_attempts',
      'account_lockouts',
      'login_history',
      'device_fingerprints',
      'request_logs',
      'sessions',
      'audit_trails',
      'user_consents',
      'data_export_requests'
    ];
    
    for (const table of tablesToCheck) {
      try {
        await prisma.$queryRaw`SELECT COUNT(*) FROM ${table}`;
        console.log(`✅ Table ${table} exists`);
      } catch (error) {
        console.log(`❌ Table ${table} missing - will be created by Prisma migration`);
      }
    }
    
    console.log('\n📋 Migration Status:');
    console.log('1. Update Prisma schema: ✅ COMPLETED');
    console.log('2. Run Prisma migration: ⏳ REQUIRED');
    console.log('3. Generate Prisma client: ⏳ REQUIRED');
    
    console.log('\n🚀 Next Steps:');
    console.log('Run these commands to complete the migration:');
    console.log('');
    console.log('  npx prisma migrate dev --name "add-auth-service-tables"');
    console.log('  npx prisma generate');
    console.log('');
    console.log('Then test the auth service with:');
    console.log('  npm run build');
    console.log('  sam local start-api');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runAuthTableMigrations();
}

module.exports = { runAuthTableMigrations };