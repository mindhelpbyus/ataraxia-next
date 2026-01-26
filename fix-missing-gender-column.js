#!/usr/bin/env node

/**
 * Fix Missing Gender Column
 * Manually add the gender column to the therapists table
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

async function fixGenderColumn() {
    console.log('🔄 Connecting to cloud RDS database...');
    
    const client = new Client(DATABASE_CONFIG);
    
    try {
        await client.connect();
        console.log('✅ Connected to cloud database');
        
        // Set search path to ataraxia schema
        await client.query('SET search_path TO ataraxia, public');
        console.log('✅ Set search path to ataraxia schema');
        
        // Check if gender column exists
        const genderCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'ataraxia' 
            AND table_name = 'therapists' 
            AND column_name = 'gender'
        `);
        
        if (genderCheck.rows.length > 0) {
            console.log('✅ Gender column already exists');
        } else {
            console.log('🔄 Adding gender column...');
            await client.query('ALTER TABLE therapists ADD COLUMN gender VARCHAR(50)');
            console.log('✅ Gender column added successfully');
        }
        
        // Add any other missing columns that are critical
        const criticalColumns = [
            { name: 'profile_photo_url', type: 'TEXT' },
            { name: 'selected_avatar_url', type: 'TEXT' },
            { name: 'headshot_url', type: 'TEXT' },
            { name: 'highest_degree', type: 'VARCHAR(100)' },
            { name: 'institution_name', type: 'VARCHAR(255)' },
            { name: 'graduation_year', type: 'INTEGER' },
            { name: 'years_of_experience', type: 'INTEGER DEFAULT 0' },
            { name: 'extended_bio', type: 'TEXT' },
            { name: 'short_bio', type: 'TEXT' },
            { name: 'phone_country_code', type: 'VARCHAR(10) DEFAULT \'+1\'' },
            { name: 'languages_spoken', type: 'JSONB DEFAULT \'[]\'' }
        ];
        
        for (const column of criticalColumns) {
            const check = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'ataraxia' 
                AND table_name = 'therapists' 
                AND column_name = $1
            `, [column.name]);
            
            if (check.rows.length === 0) {
                try {
                    console.log(`🔄 Adding ${column.name} column...`);
                    await client.query(`ALTER TABLE therapists ADD COLUMN ${column.name} ${column.type}`);
                    console.log(`✅ Added ${column.name} column`);
                } catch (error) {
                    console.log(`⚠️  Failed to add ${column.name}: ${error.message}`);
                }
            } else {
                console.log(`✅ ${column.name} column exists`);
            }
        }
        
        // Verify all critical columns now exist
        console.log('\n🔍 Final verification of critical columns...');
        const allColumns = ['gender', ...criticalColumns.map(c => c.name)];
        let allExist = true;
        
        for (const columnName of allColumns) {
            const check = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'ataraxia' 
                AND table_name = 'therapists' 
                AND column_name = $1
            `, [columnName]);
            
            if (check.rows.length > 0) {
                console.log(`  ✅ ${columnName}`);
            } else {
                console.log(`  ❌ ${columnName} MISSING`);
                allExist = false;
            }
        }
        
        if (allExist) {
            console.log('\n🎉 All critical columns exist! API should work now.');
        } else {
            console.log('\n⚠️  Some columns are still missing');
        }
        
    } catch (error) {
        console.error('❌ Failed to fix gender column:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run the fix
fixGenderColumn().catch(console.error);