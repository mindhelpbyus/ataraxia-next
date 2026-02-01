#!/usr/bin/env node
/**
 * Check Database Configuration
 * Lists all configs in system_configs table
 */

const { Client } = require('pg');
require('dotenv').config();

async function checkDatabaseConfig() {
    console.log('🔍 Checking Database Configuration...\n');

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Get all configs
        const result = await client.query(`
            SELECT config_key, config_value, created_at, updated_at
            FROM ataraxia.system_configs
            ORDER BY config_key
        `);

        console.log(`Found ${result.rows.length} configuration entries:\n`);

        // Group by key to find duplicates
        const configMap = new Map();

        result.rows.forEach(row => {
            if (!configMap.has(row.config_key)) {
                configMap.set(row.config_key, []);
            }
            configMap.get(row.config_key).push(row);
        });

        // Display configs
        let duplicateCount = 0;
        configMap.forEach((entries, key) => {
            const isDuplicate = entries.length > 1;
            if (isDuplicate) duplicateCount++;

            const icon = isDuplicate ? '⚠️ ' : '✅';
            const value = entries[0].config_value;
            const displayValue = key.includes('secret') || key.includes('key') || key.includes('password')
                ? '***REDACTED***'
                : (value?.length > 50 ? value.substring(0, 50) + '...' : value);

            console.log(`${icon} ${key}: ${displayValue}`);

            if (isDuplicate) {
                console.log(`   ⚠️  DUPLICATE! Found ${entries.length} entries:`);
                entries.forEach((entry, idx) => {
                    console.log(`      ${idx + 1}. Created: ${entry.created_at}, Updated: ${entry.updated_at}`);
                });
            }
        });

        console.log(`\n📊 Summary:`);
        console.log(`   Total unique keys: ${configMap.size}`);
        console.log(`   Total entries: ${result.rows.length}`);
        console.log(`   Duplicates: ${duplicateCount}`);

        // Check for AWS credentials
        console.log(`\n🔐 Security Check:`);
        const awsKeys = result.rows.filter(r =>
            r.config_key.includes('aws_access_key') ||
            r.config_key.includes('aws_secret')
        );

        if (awsKeys.length > 0) {
            console.log(`   ⚠️  WARNING: Found ${awsKeys.length} AWS credential entries in database!`);
            console.log(`   ⚠️  AWS credentials should NOT be stored in database for security`);
            awsKeys.forEach(k => {
                console.log(`      - ${k.config_key}`);
            });
        } else {
            console.log(`   ✅ No AWS credentials found in database (good!)`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkDatabaseConfig();
