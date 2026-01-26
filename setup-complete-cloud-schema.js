#!/usr/bin/env node

/**
 * Setup Complete Cloud Database Schema
 * This script creates the complete database schema on the cloud RDS database
 * including users, therapists, and all necessary tables
 */

const { Client } = require('pg');

// Cloud database configuration
const DATABASE_CONFIG = {
    host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: 5432,
    database: 'ataraxia_db',
    user: 'app_user',
    password: 'ChangeMe123!',
    ssl: { rejectUnauthorized: false }
};

async function setupCompleteSchema() {
    console.log('🔄 Connecting to cloud RDS database...');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        console.log('✅ Connected to cloud database');
        
        // Set search path to ataraxia schema
        await client.query('SET search_path TO ataraxia, public');
        console.log('✅ Set search path to ataraxia schema');
        
        // Check if users table exists
        const usersCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'users'
        `);
        
        if (usersCheck.rows.length === 0) {
            console.log('🔄 Creating users table...');
            await client.query(`
                CREATE TABLE users (
                    id BIGSERIAL PRIMARY KEY,
                    auth_provider_id VARCHAR(255) NOT NULL,
                    auth_provider_type VARCHAR(50) DEFAULT 'cognito',
                    email VARCHAR(255) UNIQUE NOT NULL,
                    phone_number VARCHAR(20),
                    first_name VARCHAR(100),
                    last_name VARCHAR(100),
                    role VARCHAR(50) DEFAULT 'client',
                    account_status VARCHAR(50) DEFAULT 'active',
                    is_verified BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    profile_image_url TEXT,
                    organization_id BIGINT,
                    verification_stage VARCHAR(50) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    verified_at TIMESTAMP,
                    last_login_at TIMESTAMP,
                    
                    UNIQUE(auth_provider_id, auth_provider_type)
                )
            `);
            console.log('✅ Created users table');
        } else {
            console.log('✅ Users table already exists');
        }
        
        // Check if therapists table exists and create if needed
        const therapistsCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'therapists'
        `);
        
        if (therapistsCheck.rows.length === 0) {
            console.log('🔄 Creating therapists table...');
            await client.query(`
                CREATE TABLE therapists (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    
                    -- Personal Information
                    gender VARCHAR(50),
                    date_of_birth DATE,
                    timezone VARCHAR(100) DEFAULT 'America/New_York',
                    phone_country_code VARCHAR(10) DEFAULT '+1',
                    languages_spoken JSONB DEFAULT '[]',
                    
                    -- Profile Images
                    profile_photo_url TEXT,
                    selected_avatar_url TEXT,
                    headshot_url TEXT,
                    
                    -- Professional Information
                    highest_degree VARCHAR(100),
                    institution_name VARCHAR(255),
                    graduation_year INTEGER,
                    years_of_experience INTEGER DEFAULT 0,
                    bio TEXT,
                    extended_bio TEXT,
                    short_bio TEXT,
                    
                    -- Specialties and Modalities (JSONB fields)
                    clinical_specialties JSONB DEFAULT '{}',
                    life_context_specialties JSONB DEFAULT '{}',
                    therapeutic_modalities JSONB DEFAULT '{}',
                    personal_style JSONB DEFAULT '{}',
                    demographic_preferences JSONB DEFAULT '{}',
                    
                    -- Practice Information
                    session_formats JSONB DEFAULT '{}',
                    new_clients_capacity INTEGER DEFAULT 0,
                    max_caseload_capacity INTEGER DEFAULT 0,
                    client_intake_speed VARCHAR(50),
                    emergency_same_day_capacity BOOLEAN DEFAULT false,
                    preferred_scheduling_density VARCHAR(50),
                    weekly_schedule JSONB DEFAULT '{}',
                    session_durations INTEGER[] DEFAULT '{}',
                    
                    -- Insurance and Compliance
                    insurance_panels_accepted JSONB DEFAULT '[]',
                    medicaid_acceptance BOOLEAN DEFAULT false,
                    medicare_acceptance BOOLEAN DEFAULT false,
                    self_pay_accepted BOOLEAN DEFAULT false,
                    sliding_scale BOOLEAN DEFAULT false,
                    employer_eaps JSONB DEFAULT '[]',
                    hipaa_training_completed BOOLEAN DEFAULT false,
                    ethics_certification BOOLEAN DEFAULT false,
                    signed_baa BOOLEAN DEFAULT false,
                    
                    -- Document URLs
                    w9_document_url TEXT,
                    hipaa_document_url TEXT,
                    ethics_document_url TEXT,
                    background_check_document_url TEXT,
                    
                    -- Status
                    background_check_status VARCHAR(50) DEFAULT 'not_started',
                    
                    -- Profile Content
                    what_clients_can_expect TEXT,
                    my_approach_to_therapy TEXT,
                    
                    -- Address Information
                    address_line1 VARCHAR(255),
                    address_line2 VARCHAR(255),
                    city VARCHAR(100),
                    state VARCHAR(100),
                    zip_code VARCHAR(20),
                    country VARCHAR(100) DEFAULT 'US',
                    
                    -- Timestamps
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);
            console.log('✅ Created therapists table');
        } else {
            console.log('✅ Therapists table already exists');
        }
        
        // Create some sample data if tables are empty
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count) === 0) {
            console.log('🔄 Creating sample user and therapist data...');
            
            // Create sample user
            const userResult = await client.query(`
                INSERT INTO users (
                    auth_provider_id, auth_provider_type, email, first_name, last_name, 
                    role, account_status, is_verified, is_active, verified_at
                ) VALUES (
                    'sample-therapist-001', 'cognito', 'therapist@example.com', 
                    'Dr. Sarah', 'Johnson', 'therapist', 'active', true, true, NOW()
                ) RETURNING id
            `);
            
            const userId = userResult.rows[0].id;
            
            // Create sample therapist
            await client.query(`
                INSERT INTO therapists (
                    user_id, gender, bio, clinical_specialties, therapeutic_modalities,
                    session_formats, new_clients_capacity, years_of_experience
                ) VALUES (
                    $1, 'Female', 'Experienced therapist specializing in anxiety and depression.',
                    '{"anxiety": true, "depression": true}',
                    '{"cbt": true, "mindfulness": true}',
                    '{"video": true, "in_person": true}',
                    5, 8
                )
            `, [userId]);
            
            console.log('✅ Created sample therapist data');
        } else {
            console.log('✅ User data already exists');
        }
        
        // Create indexes for performance
        console.log('🔄 Creating indexes...');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider_id, auth_provider_type)',
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
            'CREATE INDEX IF NOT EXISTS idx_therapists_user_id ON therapists(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_therapists_capacity ON therapists(new_clients_capacity) WHERE new_clients_capacity > 0'
        ];
        
        for (const indexSQL of indexes) {
            try {
                await client.query(indexSQL);
                console.log(`  ✅ Created index: ${indexSQL.substring(0, 50)}...`);
            } catch (error) {
                console.log(`  ⚠️  Index already exists: ${indexSQL.substring(0, 50)}...`);
            }
        }
        
        // Verify the complete setup
        console.log('\n🔍 Verifying complete setup...');
        
        // Check users table
        const finalUserCount = await client.query('SELECT COUNT(*) FROM users');
        console.log(`📊 Users table: ${finalUserCount.rows[0].count} records`);
        
        // Check therapists table
        const finalTherapistCount = await client.query('SELECT COUNT(*) FROM therapists');
        console.log(`📊 Therapists table: ${finalTherapistCount.rows[0].count} records`);
        
        // Test a join query (what the API does)
        const joinTest = await client.query(`
            SELECT u.id, u.first_name, u.last_name, t.bio, t.gender
            FROM users u
            INNER JOIN therapists t ON u.id = t.user_id
            WHERE u.role = 'therapist'
            LIMIT 1
        `);
        
        if (joinTest.rows.length > 0) {
            console.log('✅ Join query test successful');
            console.log(`   Sample: ${joinTest.rows[0].first_name} ${joinTest.rows[0].last_name}`);
        } else {
            console.log('⚠️  No therapist data found for join test');
        }
        
        console.log('\n🎉 Complete cloud database schema setup finished!');
        console.log('🚀 API endpoints should now work correctly');
        
    } catch (error) {
        console.error('❌ Schema setup failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run complete schema setup
setupCompleteSchema().catch(console.error);