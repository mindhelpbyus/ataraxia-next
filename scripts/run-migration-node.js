#!/usr/bin/env node

/**
 * Node.js Database Migration Runner
 * Runs the universal auth provider migration using Node.js and pg library
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration from Ataraxia_backend
const dbConfig = {
  host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
  port: 5432,
  database: 'ataraxia_db',
  user: 'app_user',
  password: 'ChangeMe123!',
  ssl: {
    rejectUnauthorized: false
  },
  options: '--search_path=ataraxia'
};

async function runMigration() {
  const client = new Client(dbConfig);
  
  try {
    console.log('🔄 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database successfully');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/migrations/001_add_auth_provider_fields.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration SQL loaded');

    // Run the migration
    console.log('🚀 Running database migration...');
    
    // Set the search path to ataraxia schema
    await client.query('SET search_path TO ataraxia, public;');
    console.log('📍 Set search path to ataraxia schema');
    
    await client.query(migrationSQL);
    console.log('✅ Database migration completed successfully');

    // Verify the migration by checking if new columns exist
    console.log('🔍 Verifying migration...');
    const verificationQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'ataraxia'
      AND table_name = 'users' 
      AND column_name IN ('auth_provider_id', 'auth_provider_type', 'auth_provider_metadata')
      ORDER BY column_name;
    `;
    
    const result = await client.query(verificationQuery);
    
    if (result.rows.length === 3) {
      console.log('✅ Migration verification successful');
      console.log('New columns added:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('⚠️  Migration verification incomplete - some columns may already exist');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
runMigration().then(() => {
  console.log('🎉 Migration process completed!');
  console.log('');
  console.log('📋 Next Steps:');
  console.log('  1. Regenerate Prisma client: npm run prisma:generate');
  console.log('  2. Run universal auth migration: npm run migrate:universal-auth');
  console.log('  3. Deploy CDK infrastructure: npm run deploy:cdk:dev');
}).catch(error => {
  console.error('💥 Migration process failed:', error);
  process.exit(1);
});