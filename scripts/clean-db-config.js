#!/usr/bin/env node
/**
 * Clean Database Configuration
 * 
 * Removes:
 * - Duplicate configurations (keeps lowercase version)
 * - Uppercase variations (COGNITO_CLIENT_ID vs cognito_client_id)
 * - Unused/legacy configurations
 */

const { Client } = require('pg');
require('dotenv').config();

async function cleanDatabaseConfig() {
    console.log('🧹 Cleaning Database Configuration...\n');

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // List of uppercase keys to remove (we keep lowercase versions)
        const uppercaseKeysToRemove = [
            'COGNITO_CLIENT_ID',
            'COGNITO_USER_POOL_ID',
            'DATABASE_URL',
            'AWS_REGION'
        ];

        // List of legacy/unused keys to remove
        const legacyKeysToRemove = [
            'API_GATEWAY_URL',
            'auth_provider_default',
            'api_timeout',
            'email_verification_required',
            'enable_detailed_errors',
            'enable_universal_auth',
            'firebase_client_email',
            'firebase_private_key',
            'mfa_required',
            'onboarding_auto_save',
            'onboarding_backup_interval',
            'onboarding_steps_total',
            'password_min_length',
            'password_rotation_days',
            'phone_verification_enabled',
            'refresh_token_expiry_days',
            'session_timeout_minutes',
            'test_hybrid_config',
            'demo_config'
        ];

        const allKeysToRemove = [...uppercaseKeysToRemove, ...legacyKeysToRemove];

        console.log(`🗑️  Removing ${allKeysToRemove.length} configuration entries...\n`);

        let removed = 0;
        for (const key of allKeysToRemove) {
            const result = await client.query(
                'DELETE FROM ataraxia.system_configs WHERE config_key = $1 RETURNING config_key',
                [key]
            );

            if (result.rowCount > 0) {
                console.log(`✅ Removed: ${key}`);
                removed++;
            }
        }

        console.log(`\n📊 Cleanup Summary:`);
        console.log(`   🗑️  Removed: ${removed} entries`);

        // Show remaining configs
        const remaining = await client.query(`
            SELECT config_key, 
                   CASE 
                       WHEN config_key LIKE '%secret%' OR config_key LIKE '%key%' OR config_key LIKE '%password%' 
                       THEN '***REDACTED***'
                       ELSE LEFT(config_value, 50)
                   END as display_value
            FROM ataraxia.system_configs
            ORDER BY config_key
        `);

        console.log(`\n✅ Remaining configurations (${remaining.rows.length}):`);
        remaining.rows.forEach(row => {
            console.log(`   - ${row.config_key}: ${row.display_value}${row.display_value.length >= 50 ? '...' : ''}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

cleanDatabaseConfig();
