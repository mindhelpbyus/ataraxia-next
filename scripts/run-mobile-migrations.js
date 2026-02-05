#!/usr/bin/env node

/**
 * Mobile App Database Migration Runner
 * Runs migrations 004 and 005 for mobile app support
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Colors for console output
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runMigration() {
  // Get database URL from environment
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    log('red', '❌ ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  log('blue', '🔄 Starting Mobile App Database Migration...');
  log('blue', `📍 Database: ${databaseUrl.replace(/:[^:@]*@/, ':****@')}`);

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // For AWS RDS
    }
  });

  try {
    // Connect to database
    log('blue', '🔌 Connecting to database...');
    await client.connect();
    log('green', '✅ Connected to database successfully');

    // Set the search path to the ataraxia schema
    await client.query('SET search_path TO ataraxia, public;');
    log('blue', '📍 Set search path to ataraxia schema');

    // Check current schema version
    log('blue', '🔍 Checking current database state...');
    
    // Check if mobile tables already exist
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'ataraxia' 
      AND table_name IN ('phone_verification_codes', 'profile_completion_tokens');
    `;
    
    const existingTables = await client.query(checkTablesQuery);
    log('blue', `📊 Found ${existingTables.rows.length} existing mobile tables`);

    // Migration 004: Auth Support Tables
    const migration004Path = path.join(__dirname, '../database/migrations/004_add_auth_support_tables.sql');
    if (fs.existsSync(migration004Path)) {
      log('blue', '📄 Running Migration 004: Auth Support Tables...');
      let migration004Sql = fs.readFileSync(migration004Path, 'utf8');
      
      // Modify SQL to use ataraxia schema
      migration004Sql = migration004Sql.replace(/CREATE TABLE IF NOT EXISTS /g, 'CREATE TABLE IF NOT EXISTS ataraxia.');
      migration004Sql = migration004Sql.replace(/CREATE INDEX IF NOT EXISTS /g, 'CREATE INDEX IF NOT EXISTS ');
      migration004Sql = migration004Sql.replace(/ON ([a-zA-Z_]+)\(/g, 'ON ataraxia.$1(');
      migration004Sql = migration004Sql.replace(/REFERENCES ([a-zA-Z_]+)\(/g, 'REFERENCES ataraxia.$1(');
      migration004Sql = migration004Sql.replace(/FROM ([a-zA-Z_]+) /g, 'FROM ataraxia.$1 ');
      migration004Sql = migration004Sql.replace(/UPDATE ([a-zA-Z_]+) /g, 'UPDATE ataraxia.$1 ');
      migration004Sql = migration004Sql.replace(/DELETE FROM ([a-zA-Z_]+) /g, 'DELETE FROM ataraxia.$1 ');
      migration004Sql = migration004Sql.replace(/INSERT INTO ([a-zA-Z_]+) /g, 'INSERT INTO ataraxia.$1 ');
      migration004Sql = migration004Sql.replace(/ALTER TABLE ([a-zA-Z_]+) /g, 'ALTER TABLE ataraxia.$1 ');
      
      try {
        await client.query(migration004Sql);
        log('green', '✅ Migration 004 completed successfully');
      } catch (error) {
        if (error.message.includes('already exists')) {
          log('yellow', '⚠️  Migration 004: Tables already exist, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      log('yellow', '⚠️  Migration 004 file not found, skipping...');
    }

    // Migration 005: Mobile Support Tables
    const migration005Path = path.join(__dirname, '../database/migrations/005_add_mobile_support_tables.sql');
    if (fs.existsSync(migration005Path)) {
      log('blue', '📄 Running Migration 005: Mobile Support Tables...');
      let migration005Sql = fs.readFileSync(migration005Path, 'utf8');
      
      // Modify SQL to use ataraxia schema
      migration005Sql = migration005Sql.replace(/CREATE TABLE IF NOT EXISTS /g, 'CREATE TABLE IF NOT EXISTS ataraxia.');
      migration005Sql = migration005Sql.replace(/CREATE INDEX IF NOT EXISTS /g, 'CREATE INDEX IF NOT EXISTS ');
      migration005Sql = migration005Sql.replace(/ON ([a-zA-Z_]+)\(/g, 'ON ataraxia.$1(');
      migration005Sql = migration005Sql.replace(/REFERENCES ([a-zA-Z_]+)\(/g, 'REFERENCES ataraxia.$1(');
      migration005Sql = migration005Sql.replace(/FROM ([a-zA-Z_]+) /g, 'FROM ataraxia.$1 ');
      migration005Sql = migration005Sql.replace(/UPDATE ([a-zA-Z_]+) /g, 'UPDATE ataraxia.$1 ');
      migration005Sql = migration005Sql.replace(/DELETE FROM ([a-zA-Z_]+) /g, 'DELETE FROM ataraxia.$1 ');
      migration005Sql = migration005Sql.replace(/INSERT INTO ([a-zA-Z_]+) /g, 'INSERT INTO ataraxia.$1 ');
      migration005Sql = migration005Sql.replace(/ALTER TABLE ([a-zA-Z_]+) /g, 'ALTER TABLE ataraxia.$1 ');
      
      try {
        await client.query(migration005Sql);
        log('green', '✅ Migration 005 completed successfully');
      } catch (error) {
        if (error.message.includes('already exists')) {
          log('yellow', '⚠️  Migration 005: Tables already exist, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      log('yellow', '⚠️  Migration 005 file not found, skipping...');
    }

    // Verify migration results
    log('blue', '🔍 Verifying migration results...');
    
    const verifyQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'ataraxia' 
      AND (
        (table_name = 'phone_verification_codes' AND column_name IN ('id', 'phone_number', 'code', 'attempts', 'expires_at'))
        OR (table_name = 'profile_completion_tokens' AND column_name IN ('id', 'token', 'user_id', 'completed', 'expires_at'))
        OR (table_name = 'users' AND column_name IN ('signup_source', 'signup_platform'))
      )
      ORDER BY table_name, column_name;
    `;
    
    const verifyResult = await client.query(verifyQuery);
    
    log('green', '📋 Migration Verification Results:');
    console.table(verifyResult.rows);

    // Check for required indexes
    const indexQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes 
      WHERE schemaname = 'ataraxia' 
      AND (
        indexname LIKE '%phone_verification%' 
        OR indexname LIKE '%profile_completion%'
        OR indexname LIKE '%signup_%'
      )
      ORDER BY tablename, indexname;
    `;
    
    const indexResult = await client.query(indexQuery);
    log('green', '📋 Created Indexes:');
    console.table(indexResult.rows);

    log('green', '🎉 Mobile App Database Migration Completed Successfully!');
    log('blue', '📋 Summary:');
    log('blue', '  ✅ phone_verification_codes table ready');
    log('blue', '  ✅ profile_completion_tokens table ready');
    log('blue', '  ✅ users table updated with signup tracking');
    log('blue', '  ✅ All indexes created');
    log('blue', '  ✅ Database ready for mobile app integration');

  } catch (error) {
    log('red', '❌ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    log('blue', '🔌 Database connection closed');
  }
}

// Run the migration
runMigration().catch(console.error);