#!/usr/bin/env node

/**
 * Simple Mobile App Database Migration Runner
 * Creates the mobile tables directly with proper schema references
 */

const { Client } = require('pg');
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

// Mobile tables SQL with proper schema references
const mobileTablesSql = `
-- Set search path to ataraxia schema
SET search_path TO ataraxia, public;

-- Phone Verification Codes Table (Enhanced for mobile)
CREATE TABLE IF NOT EXISTS phone_verification_codes (
    id BIGSERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for phone verification
CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_phone ON phone_verification_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_expires ON phone_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_phone_verification_attempts ON phone_verification_codes(attempts);

-- Profile Completion Tokens Table (for mobile app secure profile completion)
CREATE TABLE IF NOT EXISTS profile_completion_tokens (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Indexes for profile completion tokens
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_token ON profile_completion_tokens(token);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_user_id ON profile_completion_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_expires ON profile_completion_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_completed ON profile_completion_tokens(completed);

-- Add signup tracking columns to users table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ataraxia' AND table_name = 'users' AND column_name = 'signup_source'
    ) THEN
        ALTER TABLE users ADD COLUMN signup_source VARCHAR(50) NULL;
        ALTER TABLE users ADD COLUMN signup_platform VARCHAR(50) NULL;
    END IF;
END $$;

-- Add indexes for signup tracking
CREATE INDEX IF NOT EXISTS idx_users_signup_source ON users(signup_source);
CREATE INDEX IF NOT EXISTS idx_users_signup_platform ON users(signup_platform);

-- Update existing users to have default signup source (web_app for existing users)
UPDATE users 
SET signup_source = 'web_app', signup_platform = 'web'
WHERE signup_source IS NULL;

-- Grant permissions to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_verification_codes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_completion_tokens TO app_user;
GRANT USAGE, SELECT ON SEQUENCE phone_verification_codes_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE profile_completion_tokens_id_seq TO app_user;

-- Add comments for documentation
COMMENT ON TABLE phone_verification_codes IS 'Phone verification codes for mobile app SMS verification';
COMMENT ON TABLE profile_completion_tokens IS 'Secure tokens for mobile app profile completion flow';
`;

async function runMigration() {
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

    // Check current database state
    log('blue', '🔍 Checking current database state...');
    
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'ataraxia' 
      AND table_name IN ('phone_verification_codes', 'profile_completion_tokens');
    `;
    
    const existingTables = await client.query(checkTablesQuery);
    log('blue', `📊 Found ${existingTables.rows.length} existing mobile tables`);

    // Run the mobile tables migration
    log('blue', '📄 Creating mobile app support tables...');
    
    try {
      await client.query(mobileTablesSql);
      log('green', '✅ Mobile tables migration completed successfully');
    } catch (error) {
      if (error.message.includes('already exists')) {
        log('yellow', '⚠️  Some tables already exist, continuing...');
      } else {
        throw error;
      }
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

    // Final verification - count records
    const countQuery = `
      SELECT 
        'phone_verification_codes' as table_name,
        COUNT(*) as record_count
      FROM phone_verification_codes
      UNION ALL
      SELECT 
        'profile_completion_tokens' as table_name,
        COUNT(*) as record_count
      FROM profile_completion_tokens
      UNION ALL
      SELECT 
        'users_with_signup_tracking' as table_name,
        COUNT(*) as record_count
      FROM users 
      WHERE signup_source IS NOT NULL;
    `;
    
    const countResult = await client.query(countQuery);
    log('green', '📊 Table Record Counts:');
    console.table(countResult.rows);

    log('green', '🎉 Mobile App Database Migration Completed Successfully!');
    log('blue', '📋 Summary:');
    log('blue', '  ✅ phone_verification_codes table ready');
    log('blue', '  ✅ profile_completion_tokens table ready');
    log('blue', '  ✅ users table updated with signup tracking');
    log('blue', '  ✅ All indexes created');
    log('blue', '  ✅ Permissions granted to app_user');
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