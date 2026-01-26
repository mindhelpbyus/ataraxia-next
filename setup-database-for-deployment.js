#!/usr/bin/env node

/**
 * Database Setup for Enhanced Therapist Service Deployment
 * 
 * This script ensures the database has all required tables and data
 * for the enhanced therapist service to work properly.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia';

console.log('🗄️  Enhanced Therapist Service - Database Setup');
console.log('==============================================');
console.log('');

async function setupDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // For AWS RDS
    }
  });

  try {
    console.log('🔍 Step 1: Testing database connection...');
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Check if users table exists
    console.log('🔍 Step 2: Checking existing tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log(`  Found ${existingTables.length} tables:`, existingTables.join(', '));
    
    // Check if we have the essential tables
    const requiredTables = ['users', 'therapists', 'clients', 'organizations'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log('⚠️  Missing required tables:', missingTables.join(', '));
      console.log('🔧 Step 3: Creating missing tables...');
      
      // Create basic schema
      await createBasicSchema(client);
      console.log('✅ Basic schema created');
    } else {
      console.log('✅ All required tables exist');
    }
    
    // Run migrations to ensure completeness
    console.log('🔧 Step 4: Running database migrations...');
    await runMigrations(client);
    console.log('✅ Database migrations completed');
    
    // Add sample data if needed
    console.log('🔧 Step 5: Checking for sample data...');
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const therapistCount = await client.query('SELECT COUNT(*) FROM therapists');
    
    console.log(`  Users: ${userCount.rows[0].count}`);
    console.log(`  Therapists: ${therapistCount.rows[0].count}`);
    
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('🔧 Adding sample data for testing...');
      await addSampleData(client);
      console.log('✅ Sample data added');
    }
    
    // Test the enhanced therapist queries
    console.log('🧪 Step 6: Testing enhanced therapist queries...');
    await testEnhancedQueries(client);
    console.log('✅ Enhanced queries working');
    
    client.release();
    console.log('');
    console.log('🎉 Database Setup Complete!');
    console.log('   The enhanced therapist service is ready to use.');
    console.log('');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('  1. Check if the database server is running');
    console.error('  2. Verify the DATABASE_URL is correct');
    console.error('  3. Ensure the database user has proper permissions');
    console.error('  4. Check network connectivity to the database');
    console.error('');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function createBasicSchema(client) {
  // Create organizations table
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // Create users table
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      phone_number VARCHAR(50),
      role VARCHAR(50) NOT NULL DEFAULT 'client',
      account_status VARCHAR(50) DEFAULT 'active',
      is_verified BOOLEAN DEFAULT false,
      verification_stage VARCHAR(100),
      profile_image_url TEXT,
      organization_id INTEGER REFERENCES organizations(id),
      auth_provider_type VARCHAR(50) DEFAULT 'cognito',
      auth_provider_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // Create therapists table with enhanced fields
  await client.query(`
    CREATE TABLE IF NOT EXISTS therapists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      gender VARCHAR(50),
      date_of_birth DATE,
      timezone VARCHAR(100),
      phone_country_code VARCHAR(10),
      languages_spoken JSONB DEFAULT '[]',
      profile_photo_url TEXT,
      selected_avatar_url TEXT,
      headshot_url TEXT,
      highest_degree VARCHAR(100),
      institution_name VARCHAR(255),
      graduation_year INTEGER,
      years_of_experience INTEGER DEFAULT 0,
      bio TEXT,
      extended_bio TEXT,
      short_bio TEXT,
      clinical_specialties JSONB DEFAULT '{}',
      life_context_specialties JSONB DEFAULT '{}',
      therapeutic_modalities JSONB DEFAULT '{}',
      personal_style JSONB DEFAULT '{}',
      demographic_preferences JSONB DEFAULT '{}',
      session_formats JSONB DEFAULT '{}',
      new_clients_capacity INTEGER DEFAULT 0,
      max_caseload_capacity INTEGER DEFAULT 20,
      client_intake_speed VARCHAR(50),
      emergency_same_day_capacity BOOLEAN DEFAULT false,
      preferred_scheduling_density VARCHAR(50),
      weekly_schedule JSONB DEFAULT '{}',
      session_durations INTEGER[] DEFAULT '{45,60}',
      insurance_panels_accepted JSONB DEFAULT '[]',
      medicaid_acceptance BOOLEAN DEFAULT false,
      medicare_acceptance BOOLEAN DEFAULT false,
      self_pay_accepted BOOLEAN DEFAULT true,
      sliding_scale BOOLEAN DEFAULT false,
      employer_eaps JSONB DEFAULT '[]',
      hipaa_training_completed BOOLEAN DEFAULT false,
      ethics_certification BOOLEAN DEFAULT false,
      signed_baa BOOLEAN DEFAULT false,
      background_check_status VARCHAR(50),
      what_clients_can_expect TEXT,
      my_approach_to_therapy TEXT,
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      zip_code VARCHAR(20),
      country VARCHAR(100) DEFAULT 'US',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // Create clients table
  await client.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      preferred_session_format VARCHAR(50),
      preferred_session_duration INTEGER DEFAULT 60,
      preferred_therapist_gender VARCHAR(50),
      therapy_goals TEXT[],
      insurance_provider VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      safety_risk_level VARCHAR(50) DEFAULT 'low',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // Create therapist_verifications table
  await client.query(`
    CREATE TABLE IF NOT EXISTS therapist_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      license_number VARCHAR(100),
      license_state VARCHAR(50),
      license_type VARCHAR(100),
      license_expiry DATE,
      license_verified BOOLEAN DEFAULT false,
      npi_number VARCHAR(20),
      licensing_authority VARCHAR(255),
      malpractice_insurance_provider VARCHAR(255),
      malpractice_policy_number VARCHAR(100),
      malpractice_expiry DATE,
      verification_status VARCHAR(50) DEFAULT 'pending',
      background_check_status VARCHAR(50),
      background_check_result JSONB DEFAULT '{}',
      verification_notes TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function runMigrations(client) {
  // Add indexes for performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
    'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);',
    'CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);',
    'CREATE INDEX IF NOT EXISTS idx_therapists_user_id ON therapists(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_therapists_city_state ON therapists(city, state);',
    'CREATE INDEX IF NOT EXISTS idx_therapists_specialties ON therapists USING GIN(clinical_specialties);',
    'CREATE INDEX IF NOT EXISTS idx_therapists_modalities ON therapists USING GIN(therapeutic_modalities);',
    'CREATE INDEX IF NOT EXISTS idx_therapists_capacity ON therapists(new_clients_capacity) WHERE new_clients_capacity > 0;',
    'CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_verifications_user_id ON therapist_verifications(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_verifications_status ON therapist_verifications(verification_status);'
  ];
  
  for (const indexSql of indexes) {
    try {
      await client.query(indexSql);
    } catch (error) {
      // Index might already exist, continue
    }
  }
}

async function addSampleData(client) {
  // Add sample organization
  await client.query(`
    INSERT INTO organizations (name, type) 
    VALUES ('Ataraxia Healthcare', 'healthcare_platform')
    ON CONFLICT DO NOTHING;
  `);
  
  const orgResult = await client.query('SELECT id FROM organizations LIMIT 1');
  const orgId = orgResult.rows[0]?.id || 1;
  
  // Add sample therapist user
  await client.query(`
    INSERT INTO users (
      first_name, last_name, email, phone_number, role, 
      account_status, is_verified, verification_stage, organization_id,
      auth_provider_type, auth_provider_id
    ) VALUES (
      'Dr. Sarah', 'Johnson', 'sarah.johnson@example.com', '+1-555-0123', 'therapist',
      'active', true, 'approved', $1,
      'cognito', 'sample-therapist-1'
    ) ON CONFLICT (email) DO NOTHING;
  `, [orgId]);
  
  // Get the therapist user ID
  const userResult = await client.query('SELECT id FROM users WHERE email = $1', ['sarah.johnson@example.com']);
  if (userResult.rows.length > 0) {
    const userId = userResult.rows[0].id;
    
    // Add therapist profile
    await client.query(`
      INSERT INTO therapists (
        user_id, gender, years_of_experience, highest_degree, bio, short_bio,
        clinical_specialties, therapeutic_modalities, session_formats,
        new_clients_capacity, max_caseload_capacity, city, state,
        insurance_panels_accepted, self_pay_accepted, medicaid_acceptance
      ) VALUES (
        $1, 'female', 8, 'PhD in Clinical Psychology', 
        'Experienced therapist specializing in anxiety and depression treatment.',
        'Anxiety & depression specialist with 8+ years experience.',
        '{"anxiety": true, "depression": true, "trauma": false}',
        '{"cbt": true, "dbt": false, "emdr": false}',
        '{"in_person": true, "video": true, "phone": false}',
        5, 25, 'Seattle', 'WA',
        '["Aetna", "Blue Cross Blue Shield"]', true, true
      ) ON CONFLICT (user_id) DO NOTHING;
    `, [userId]);
    
    // Add verification record
    await client.query(`
      INSERT INTO therapist_verifications (
        user_id, license_number, license_state, license_type,
        license_verified, verification_status, background_check_status
      ) VALUES (
        $1, 'LIC123456', 'WA', 'Licensed Clinical Psychologist',
        true, 'approved', 'cleared'
      ) ON CONFLICT (user_id) DO NOTHING;
    `, [userId]);
  }
  
  // Add sample client user
  await client.query(`
    INSERT INTO users (
      first_name, last_name, email, phone_number, role, 
      account_status, is_verified, organization_id,
      auth_provider_type, auth_provider_id
    ) VALUES (
      'John', 'Doe', 'john.doe@example.com', '+1-555-0456', 'client',
      'active', true, $1,
      'cognito', 'sample-client-1'
    ) ON CONFLICT (email) DO NOTHING;
  `, [orgId]);
  
  // Get the client user ID and add client profile
  const clientResult = await client.query('SELECT id FROM users WHERE email = $1', ['john.doe@example.com']);
  if (clientResult.rows.length > 0) {
    const clientId = clientResult.rows[0].id;
    
    await client.query(`
      INSERT INTO clients (
        user_id, preferred_session_format, preferred_therapist_gender,
        therapy_goals, insurance_provider, city, state
      ) VALUES (
        $1, 'video', 'female', 
        ARRAY['anxiety management', 'stress reduction'],
        'Aetna', 'Seattle', 'WA'
      ) ON CONFLICT (user_id) DO NOTHING;
    `, [clientId]);
  }
}

async function testEnhancedQueries(client) {
  // Test basic therapist query
  const therapistResult = await client.query(`
    SELECT u.id, u.first_name, u.last_name, tp.clinical_specialties
    FROM users u
    INNER JOIN therapists tp ON u.id = tp.user_id
    WHERE u.role = 'therapist' AND u.account_status = 'active'
    LIMIT 1;
  `);
  
  if (therapistResult.rows.length === 0) {
    throw new Error('No therapists found for testing');
  }
  
  // Test JSONB specialty query
  await client.query(`
    SELECT COUNT(*) FROM therapists 
    WHERE clinical_specialties ? 'anxiety';
  `);
  
  // Test advanced search query
  await client.query(`
    SELECT u.id, u.first_name, u.last_name
    FROM users u
    INNER JOIN therapists tp ON u.id = tp.user_id
    LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
    WHERE u.role = 'therapist' 
      AND u.account_status = 'active' 
      AND tp.new_clients_capacity > 0
    LIMIT 5;
  `);
  
  console.log('  ✅ Basic therapist queries working');
  console.log('  ✅ JSONB specialty queries working');
  console.log('  ✅ Advanced search queries working');
}

// Run the setup
setupDatabase().catch(console.error);