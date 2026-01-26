#!/usr/bin/env node

/**
 * Run Database Migrations on Cloud RDS Database
 * This script connects to the cloud database and runs the necessary migrations
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

async function runMigrations() {
    console.log('🔄 Connecting to cloud RDS database...');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        console.log('✅ Connected to cloud database');
        
        // Set search path to ataraxia schema
        await client.query('SET search_path TO ataraxia, public');
        console.log('✅ Set search path to ataraxia schema');
        
        // Check if gender column exists
        console.log('🔍 Checking if gender column exists in therapists table...');
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'therapists' 
            AND column_name = 'gender'
        `);
        
        if (columnCheck.rows.length > 0) {
            console.log('✅ Gender column already exists in therapists table');
        } else {
            console.log('❌ Gender column missing - running migration...');
            
            // Run migration 003 to add missing columns
            console.log('🔄 Running migration 003 (therapists table completeness)...');
            const migrationPath = path.join(__dirname, 'database/migrations/003_ensure_therapists_table_completeness.sql');
            
            if (!fs.existsSync(migrationPath)) {
                throw new Error(`Migration file not found: ${migrationPath}`);
            }
            
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
            await client.query(migrationSQL);
            console.log('✅ Migration 003 completed successfully');
        }
        
        // Verify the column now exists
        const verifyCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'therapists' 
            AND column_name = 'gender'
        `);
        
        if (verifyCheck.rows.length > 0) {
            console.log('✅ Gender column verified in therapists table');
        } else {
            throw new Error('Gender column still missing after migration');
        }
        
        // Check other important columns
        console.log('🔍 Checking other important columns...');
        const importantColumns = [
            'bio', 'clinical_specialties', 'therapeutic_modalities', 
            'session_formats', 'new_clients_capacity'
        ];
        
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
            }
        }
        
        // Check if we have any therapist data
        console.log('🔍 Checking therapist data...');
        const therapistCount = await client.query('SELECT COUNT(*) FROM therapists');
        console.log(`📊 Found ${therapistCount.rows[0].count} therapists in database`);
        
        if (parseInt(therapistCount.rows[0].count) === 0) {
            console.log('⚠️  No therapist data found. You may need to run data migration.');
        }
        
        console.log('\n🎉 Cloud database migration check completed!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migrations
runMigrations().catch(console.error);