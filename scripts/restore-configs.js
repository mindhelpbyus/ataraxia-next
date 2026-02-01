#!/usr/bin/env node
/**
 * Restore Removed Configurations
 * Restores all configurations that were removed by clean-db-config.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function restoreConfigs() {
    console.log('🔄 Restoring removed configurations...\n');

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Configurations to restore
        const configsToRestore = [
            { key: 'COGNITO_CLIENT_ID', value: '7ek8kg1td2ps985r21m7727q98', description: 'Cognito Client ID (uppercase)' },
            { key: 'COGNITO_USER_POOL_ID', value: 'us-west-2_xeXlyFBMH', description: 'Cognito User Pool ID (uppercase)' },
            { key: 'DATABASE_URL', value: process.env.DATABASE_URL, description: 'Database URL (uppercase)' },
            { key: 'AWS_REGION', value: 'us-west-2', description: 'AWS Region' },
            { key: 'API_GATEWAY_URL', value: 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev', description: 'API Gateway URL' },
            { key: 'auth_provider_default', value: 'cognito', description: 'Default auth provider' },
            { key: 'api_timeout', value: '30000', description: 'API timeout in ms' },
            { key: 'email_verification_required', value: 'true', description: 'Email verification required' },
            { key: 'enable_detailed_errors', value: 'true', description: 'Enable detailed errors' },
            { key: 'enable_universal_auth', value: 'true', description: 'Enable universal auth' },
            { key: 'mfa_required', value: 'false', description: 'MFA required' },
            { key: 'phone_verification_enabled', value: 'true', description: 'Phone verification enabled' },
            { key: 'refresh_token_expiry_days', value: '7', description: 'Refresh token expiry in days' },
            { key: 'session_timeout_minutes', value: '60', description: 'Session timeout in minutes' },
            { key: 'password_min_length', value: '8', description: 'Minimum password length' },
            { key: 'password_rotation_days', value: '90', description: 'Password rotation days' },
            { key: 'onboarding_auto_save', value: 'true', description: 'Onboarding auto save' },
            { key: 'onboarding_backup_interval', value: '30000', description: 'Onboarding backup interval' },
            { key: 'onboarding_steps_total', value: '10', description: 'Total onboarding steps' },
        ];

        let restored = 0;
        for (const config of configsToRestore) {
            try {
                await client.query(`
                    INSERT INTO ataraxia.system_configs (config_key, config_value, description)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (config_key) DO UPDATE
                    SET config_value = $2, description = $3, updated_at = CURRENT_TIMESTAMP
                `, [config.key, config.value, config.description]);

                console.log(`✅ Restored: ${config.key}`);
                restored++;
            } catch (error) {
                console.error(`❌ Failed to restore ${config.key}:`, error.message);
            }
        }

        console.log(`\n📊 Restore Summary:`);
        console.log(`   ✅ Restored: ${restored} configurations`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

restoreConfigs();
