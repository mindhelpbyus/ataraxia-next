#!/usr/bin/env node

/**
 * Check Therapist Data in Cloud Database
 * See what therapist IDs actually exist
 */

const { Client } = require('pg');

const DATABASE_CONFIG = {
    host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: 5432,
    database: 'ataraxia_db',
    user: 'app_user',
    password: 'ChangeMe123!',
    ssl: { rejectUnauthorized: false }
};

async function checkTherapistData() {
    console.log('🔍 Checking therapist data in cloud database...\n');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        await client.query('SET search_path TO ataraxia, public');
        
        // Check all therapists with their user data
        const therapists = await client.query(`
            SELECT 
                u.id as user_id,
                u.first_name,
                u.last_name,
                u.email,
                t.id as therapist_id,
                t.bio,
                t.gender
            FROM users u
            INNER JOIN therapists t ON u.id = t.user_id
            WHERE u.role = 'therapist'
            ORDER BY u.id
        `);
        
        console.log(`📊 Found ${therapists.rows.length} therapists:`);
        
        therapists.rows.forEach((therapist, index) => {
            console.log(`${index + 1}. User ID: ${therapist.user_id}, Therapist ID: ${therapist.therapist_id}`);
            console.log(`   Name: ${therapist.first_name} ${therapist.last_name}`);
            console.log(`   Email: ${therapist.email}`);
            console.log(`   Gender: ${therapist.gender || 'Not set'}`);
            console.log(`   Bio: ${therapist.bio ? therapist.bio.substring(0, 50) + '...' : 'Not set'}`);
            console.log('');
        });
        
        // Test the specific ID that's failing
        console.log('🔍 Testing specific therapist ID 1000008...');
        const specificTest = await client.query(`
            SELECT 
                u.id as user_id,
                u.first_name,
                u.last_name,
                t.id as therapist_id
            FROM users u
            INNER JOIN therapists t ON u.id = t.user_id
            WHERE u.id = 1000008 OR t.id = 1000008
        `);
        
        if (specificTest.rows.length > 0) {
            console.log('✅ Found therapist with ID 1000008');
            console.log(specificTest.rows[0]);
        } else {
            console.log('❌ No therapist found with ID 1000008');
            console.log('💡 Try using one of the existing IDs above');
        }
        
    } catch (error) {
        console.error('❌ Failed to check therapist data:', error.message);
    } finally {
        await client.end();
    }
}

checkTherapistData();