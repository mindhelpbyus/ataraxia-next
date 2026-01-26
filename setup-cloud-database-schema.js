#!/usr/bin/env node

/**
 * Setup Cloud Database Schema
 * This script sets up the complete database schema on the cloud RDS database
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Cloud database configuration
const DATABASE_CONFIG = {
    host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: 5432,
    database: 'ataraxia_db',
    user: 'app_user',
    password: 'ChangeMe123!',
    ssl: { rejectUnauthorized: false }
};

async function setupSchema() {
    console.log('🔄 Connecting to cloud RDS database...');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        console.log('✅ Connected to cloud database');
        
        // Set search path to ataraxia schema
        await client.query('SET search_path TO ataraxia, public');
        console.log('✅ Set search path to ataraxia schema');
        
        // Check if ataraxia schema exists
        const schemaCheck = await client.query(`
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name = 'ataraxia'
        `);
        
        if (schemaCheck.rows.length === 0) {
            console.log('🔄 Creating ataraxia schema...');
            await client.query('CREATE SCHEMA IF NOT EXISTS ataraxia');
            await client.query('SET search_path TO ataraxia, public');
            console.log('✅ Created ataraxia schema');
        } else {
            console.log('✅ Ataraxia schema already exists');
        }
        
        // Check if therapists table exists
        const therapistsCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'therapists'
        `);
        
        if (therapistsCheck.rows.length === 0) {
            console.log('❌ Therapists table missing - need to create base schema first');
            console.log('⚠️  The cloud database needs the base schema setup');
            console.log('💡 You may need to run the initial database setup on the cloud database');
            
            // Create a minimal therapists table for now
            console.log('🔄 Creating minimal therapists table...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS therapists (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);
            console.log('✅ Created minimal therapists table');
        } else {
            console.log('✅ Therapists table exists');
        }
        
        // Run migration 003 to add all missing columns
        console.log('🔄 Running migration 003 (therapists table completeness)...');
        const migrationPath = path.join(__dirname, 'database/migrations/003_ensure_therapists_table_completeness.sql');
        
        if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
        }
        
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Split the migration into individual statements and run them one by one
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (const statement of statements) {
            if (statement.includes('ALTER TABLE therapists ADD COLUMN')) {
                try {
                    await client.query(statement + ';');
                    console.log(`  ✅ Executed: ${statement.substring(0, 50)}...`);
                } catch (error) {
                    if (error.message.includes('already exists')) {
                        console.log(`  ⚠️  Column already exists: ${statement.substring(0, 50)}...`);
                    } else {
                        console.log(`  ❌ Failed: ${statement.substring(0, 50)}... - ${error.message}`);
                    }
                }
            } else if (statement.includes('CREATE INDEX') || statement.includes('COMMENT ON')) {
                try {
                    await client.query(statement + ';');
                    console.log(`  ✅ Executed: ${statement.substring(0, 50)}...`);
                } catch (error) {
                    console.log(`  ⚠️  Skipped: ${statement.substring(0, 50)}... - ${error.message}`);
                }
            }
        }
        
        console.log('✅ Migration 003 completed');
        
        // Verify important columns exist
        console.log('🔍 Verifying important columns...');
        const importantColumns = [
            'gender', 'bio', 'clinical_specialties', 'therapeutic_modalities', 
            'session_formats', 'new_clients_capacity', 'date_of_birth', 'timezone'
        ];
        
        let allColumnsExist = true;
        for (const column of importantColumns) {
            const check = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'ataraxia' 
                AND table_name = 'therapists' 
                AND column_name = $1
            `, [column]);
            
            if (check.rows.length > 0) {
                console.log(`  ✅ ${column} column exists`);
            } else {
                console.log(`  ❌ ${column} column missing`);
                allColumnsExist = false;
            }
        }
        
        if (allColumnsExist) {
            console.log('🎉 All important columns exist in therapists table!');
        } else {
            console.log('⚠️  Some columns are still missing');
        }
        
        // Check if we have any therapist data
        console.log('🔍 Checking therapist data...');
        const therapistCount = await client.query('SELECT COUNT(*) FROM therapists');
        console.log(`📊 Found ${therapistCount.rows[0].count} therapists in database`);
        
        console.log('\n🎉 Cloud database schema setup completed!');
        console.log('🚀 You can now test the API endpoints again');
        
    } catch (error) {
        console.error('❌ Schema setup failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run schema setup
setupSchema().catch(console.error);