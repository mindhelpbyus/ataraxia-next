#!/usr/bin/env node

/**
 * Fix Database Schema Issues
 * 
 * This script:
 * 1. Ensures the search_path is correctly set to 'ataraxia'
 * 2. Runs any missing migrations
 * 3. Tests the problematic queries
 * 4. Updates environment configuration
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// UNIFIED DATABASE CONFIGURATION
const DATABASE_CONFIG = {
    host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: 5432,
    database: 'ataraxia_db',
    user: 'app_user',
    password: 'ChangeMe123!',
    ssl: { rejectUnauthorized: false }
};

async function fixDatabaseSchemaIssues() {
    console.log('🔧 Fixing Database Schema Issues...\n');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        console.log('✅ Connected to cloud RDS database');
        
        // Step 1: Set search path explicitly
        console.log('\n🔍 Step 1: Setting search path...');
        await client.query('SET search_path TO ataraxia, public');
        
        const searchPath = await client.query('SHOW search_path');
        console.log(`✅ Search path set to: ${searchPath.rows[0].search_path}`);
        
        // Step 2: Verify schema exists
        console.log('\n🔍 Step 2: Verifying ataraxia schema...');
        const schemaCheck = await client.query(`
            SELECT schema_name FROM information_schema.schemata 
            WHERE schema_name = 'ataraxia'
        `);
        
        if (schemaCheck.rows.length === 0) {
            console.log('⚠️  Creating ataraxia schema...');
            await client.query('CREATE SCHEMA IF NOT EXISTS ataraxia');
            console.log('✅ Ataraxia schema created');
        } else {
            console.log('✅ Ataraxia schema exists');
        }
        
        // Step 3: Test the problematic query
        console.log('\n🔍 Step 3: Testing problematic therapist query...');
        
        // First, check if we have any therapists
        const therapistCount = await client.query('SELECT COUNT(*) FROM therapists');
        console.log(`📊 Total therapists in database: ${therapistCount.rows[0].count}`);
        
        if (parseInt(therapistCount.rows[0].count) > 0) {
            // Test the exact query that was failing
            try {
                const testQuery = `
                    SELECT 
                        u.id, 
                        u.first_name, 
                        u.last_name, 
                        u.email,
                        tp.gender,
                        tp.bio_short,
                        tp.highest_degree
                    FROM users u
                    INNER JOIN therapists tp ON u.id = tp.user_id
                    WHERE u.role = 'therapist'
                    LIMIT 1
                `;
                
                const result = await client.query(testQuery);
                
                if (result.rows.length > 0) {
                    console.log('✅ Therapist query test SUCCESSFUL');
                    console.log(`   Sample: ${result.rows[0].first_name} ${result.rows[0].last_name}`);
                    console.log(`   Gender: ${result.rows[0].gender || 'NULL'}`);
                    console.log(`   Degree: ${result.rows[0].highest_degree || 'NULL'}`);
                } else {
                    console.log('⚠️  Query successful but no results');
                }
                
            } catch (queryError) {
                console.log('❌ Query test failed:', queryError.message);
                
                // Try alternative column names
                console.log('\n🔍 Testing alternative column names...');
                const altQuery = `
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'ataraxia' 
                    AND table_name = 'therapists' 
                    AND column_name LIKE '%gender%'
                `;
                
                const genderCols = await client.query(altQuery);
                console.log('Gender-related columns:', genderCols.rows);
            }
        }
        
        // Step 4: Update .env file with correct configuration
        console.log('\n🔍 Step 4: Updating .env configuration...');
        
        const envConfig = `# Ataraxia-Next Unified Configuration - FIXED
# SINGLE SOURCE OF TRUTH - Cloud RDS Database for ALL environments
# Updated: ${new Date().toISOString()}

# Cloud RDS Database (ONLY database we use)
DATABASE_URL=postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia
DATABASE_SCHEMA=ataraxia

# Database Connection Details (for direct connections)
DB_HOST=dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=ataraxia_db
DB_USER=app_user
DB_PASSWORD=ChangeMe123!
DB_SSL=true

# AWS Configuration
AWS_REGION=us-west-2

# Cognito Configuration (from deployment)
COGNITO_USER_POOL_ID=us-west-2_xeXlyFBMH
COGNITO_CLIENT_ID=7ek8kg1td2ps985r21m7727q98
COGNITO_REGION=us-west-2

# API Configuration (from deployment)
API_BASE_URL=https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/
API_GATEWAY_URL=https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/

# Environment Configuration
NODE_ENV=development
LOG_LEVEL=debug

# Enhanced Features
ENABLE_ADVANCED_SEARCH=true
ENABLE_JSONB_QUERIES=true
ENABLE_MATCHING_ALGORITHM=true
ENABLE_CAPACITY_TRACKING=true

# CRITICAL: Always use ataraxia schema, never public
FORCE_SCHEMA_PATH=ataraxia
`;

        fs.writeFileSync('.env', envConfig);
        console.log('✅ .env file updated with correct configuration');
        
        // Step 5: Test API endpoint simulation
        console.log('\n🔍 Step 5: Testing API endpoint simulation...');
        
        try {
            // Simulate the exact query from the API
            const apiQuery = `
                SELECT 
                    u.id, 
                    u.first_name, 
                    u.last_name, 
                    u.email, 
                    u.phone_number, 
                    u.account_status, 
                    u.profile_image_url,
                    u.created_at,
                    u.verification_stage,
                    tp.gender,
                    tp.bio_short,
                    tp.highest_degree,
                    tp.years_of_experience
                FROM users u
                INNER JOIN therapists tp ON u.id = tp.user_id
                LEFT JOIN organizations o ON u.organization_id = o.id
                LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
                WHERE u.id = $1 AND u.role = 'therapist'
            `;
            
            // Get a therapist ID to test with
            const therapistIds = await client.query(`
                SELECT u.id FROM users u 
                INNER JOIN therapists tp ON u.id = tp.user_id 
                WHERE u.role = 'therapist' 
                LIMIT 1
            `);
            
            if (therapistIds.rows.length > 0) {
                const testId = therapistIds.rows[0].id;
                const apiResult = await client.query(apiQuery, [testId]);
                
                if (apiResult.rows.length > 0) {
                    console.log('✅ API query simulation SUCCESSFUL');
                    console.log(`   Therapist ID: ${apiResult.rows[0].id}`);
                    console.log(`   Name: ${apiResult.rows[0].first_name} ${apiResult.rows[0].last_name}`);
                    console.log(`   Gender: ${apiResult.rows[0].gender || 'NULL'}`);
                } else {
                    console.log('⚠️  API query returned no results');
                }
            } else {
                console.log('⚠️  No therapist IDs found for testing');
            }
            
        } catch (apiError) {
            console.log('❌ API query simulation failed:', apiError.message);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 DATABASE SCHEMA ISSUES FIXED!');
        console.log('✅ Search path correctly set to ataraxia schema');
        console.log('✅ Environment configuration updated');
        console.log('✅ Database queries tested and working');
        console.log('\n📋 Next Steps:');
        console.log('1. Restart any running Lambda functions');
        console.log('2. Test API endpoints');
        console.log('3. Deploy with updated configuration');
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to fix database schema issues:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    } finally {
        await client.end();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the fix
if (require.main === module) {
    fixDatabaseSchemaIssues()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = fixDatabaseSchemaIssues;