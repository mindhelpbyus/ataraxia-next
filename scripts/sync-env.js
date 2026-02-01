#!/usr/bin/env node
/**
 * Environment Sync Script
 * 
 * Keeps .env, database (system_configs), and Prisma schema in perfect sync
 * 
 * Usage:
 *   node scripts/sync-env.js              # Sync .env → Database
 *   node scripts/sync-env.js --from-db    # Sync Database → .env
 *   node scripts/sync-env.js --validate   # Validate all sources match
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration keys to sync
const CONFIG_KEYS = [
    // Auth Provider
    { key: 'auth_provider_type', envKey: 'AUTH_PROVIDER_TYPE', description: 'Active auth provider (firebase/cognito)' },

    // Firebase Config
    { key: 'firebase_api_key', envKey: 'FIREBASE_API_KEY', description: 'Firebase API Key (Frontend)' },
    { key: 'firebase_auth_domain', envKey: 'FIREBASE_AUTH_DOMAIN', description: 'Firebase Auth Domain' },
    { key: 'firebase_project_id', envKey: 'FIREBASE_PROJECT_ID', description: 'Firebase Project ID' },
    { key: 'firebase_storage_bucket', envKey: 'FIREBASE_STORAGE_BUCKET', description: 'Firebase Storage Bucket' },
    { key: 'firebase_messaging_sender_id', envKey: 'FIREBASE_MESSAGING_SENDER_ID', description: 'Firebase Messaging Sender ID' },
    { key: 'firebase_app_id', envKey: 'FIREBASE_APP_ID', description: 'Firebase App ID' },
    { key: 'firebase_measurement_id', envKey: 'FIREBASE_MEASUREMENT_ID', description: 'Firebase Measurement ID' },

    // Cognito Config
    { key: 'cognito_user_pool_id', envKey: 'COGNITO_USER_POOL_ID', description: 'Cognito User Pool ID' },
    { key: 'cognito_client_id', envKey: 'COGNITO_CLIENT_ID', description: 'Cognito Client ID' },
    { key: 'cognito_region', envKey: 'AWS_REGION', description: 'AWS Region' },

    // AWS Credentials (ENV ONLY - NOT synced to database for security)
    { key: 'aws_access_key_id', envKey: 'AWS_ACCESS_KEY_ID', description: 'AWS Access Key ID', envOnly: true, sensitive: true },
    { key: 'aws_secret_access_key', envKey: 'AWS_SECRET_ACCESS_KEY', description: 'AWS Secret Access Key', envOnly: true, sensitive: true },

    // Database
    { key: 'database_url', envKey: 'DATABASE_URL', description: 'PostgreSQL Connection String', sensitive: true },
    { key: 'database_schema', envKey: 'DATABASE_SCHEMA', description: 'Database Schema Name' },

    // API
    { key: 'api_port', envKey: 'API_PORT', description: 'API Server Port' },
    { key: 'node_env', envKey: 'NODE_ENV', description: 'Node Environment' },
];

async function syncEnvToDatabase() {
    console.log('🔄 Syncing .env → Database...\n');

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const config of CONFIG_KEYS) {
        // Skip env-only configs (like AWS credentials)
        if (config.envOnly) {
            console.log(`🔒 Skipping ${config.key} (env-only, not synced to database)`);
            skipped++;
            continue;
        }

        const envValue = process.env[config.envKey];

        if (!envValue) {
            console.log(`⏭️  Skipping ${config.key} (not in .env)`);
            skipped++;
            continue;
        }

        try {
            await prisma.system_configs.upsert({
                where: { config_key: config.key },
                update: {
                    config_value: envValue,
                    description: config.description,
                    updated_at: new Date()
                },
                create: {
                    config_key: config.key,
                    config_value: envValue,
                    description: config.description
                }
            });

            const displayValue = config.sensitive
                ? envValue.substring(0, 20) + '...'
                : envValue;
            console.log(`✅ Synced ${config.key}: ${displayValue}`);
            synced++;
        } catch (error) {
            console.error(`❌ Failed to sync ${config.key}:`, error.message);
            errors++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Synced: ${synced}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
}

async function syncDatabaseToEnv() {
    console.log('🔄 Syncing Database → .env...\n');

    const envPath = path.join(__dirname, '../.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    let updated = 0;
    let added = 0;

    for (const config of CONFIG_KEYS) {
        try {
            const dbConfig = await prisma.system_configs.findUnique({
                where: { config_key: config.key }
            });

            if (!dbConfig || !dbConfig.config_value) {
                console.log(`⏭️  Skipping ${config.key} (not in database)`);
                continue;
            }

            const envLine = `${config.envKey}=${dbConfig.config_value}`;
            const envRegex = new RegExp(`^${config.envKey}=.*$`, 'm');

            if (envRegex.test(envContent)) {
                // Update existing
                envContent = envContent.replace(envRegex, envLine);
                console.log(`✅ Updated ${config.envKey}`);
                updated++;
            } else {
                // Add new
                envContent += `\n${envLine}`;
                console.log(`➕ Added ${config.envKey}`);
                added++;
            }
        } catch (error) {
            console.error(`❌ Failed to sync ${config.key}:`, error.message);
        }
    }

    // Write back to .env
    fs.writeFileSync(envPath, envContent.trim() + '\n');

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ➕ Added: ${added}`);
    console.log(`   📝 File: ${envPath}`);
}

async function validateSync() {
    console.log('🔍 Validating .env ↔ Database sync...\n');

    let matches = 0;
    let mismatches = 0;
    let missing = 0;
    let envOnlyChecked = 0;

    for (const config of CONFIG_KEYS) {
        const envValue = process.env[config.envKey];

        // For env-only configs, just check they exist in .env
        if (config.envOnly) {
            if (envValue) {
                console.log(`🔒 ${config.key}: Present in .env (env-only)`);
                envOnlyChecked++;
            } else {
                console.log(`⚠️  ${config.key}: MISSING in .env (env-only)`);
                missing++;
            }
            continue;
        }

        try {
            const dbConfig = await prisma.system_configs.findUnique({
                where: { config_key: config.key }
            });

            if (!envValue && !dbConfig) {
                console.log(`⚠️  ${config.key}: Missing in both`);
                missing++;
                continue;
            }

            if (!envValue) {
                console.log(`⚠️  ${config.key}: Missing in .env`);
                missing++;
                continue;
            }

            if (!dbConfig || !dbConfig.config_value) {
                console.log(`⚠️  ${config.key}: Missing in database`);
                missing++;
                continue;
            }

            if (envValue === dbConfig.config_value) {
                console.log(`✅ ${config.key}: Synced`);
                matches++;
            } else {
                console.log(`❌ ${config.key}: MISMATCH`);
                console.log(`   .env: ${envValue.substring(0, 50)}...`);
                console.log(`   DB:   ${dbConfig.config_value.substring(0, 50)}...`);
                mismatches++;
            }
        } catch (error) {
            console.error(`❌ Failed to validate ${config.key}:`, error.message);
        }
    }

    console.log(`\n📊 Validation Summary:`);
    console.log(`   ✅ Matches: ${matches}`);
    console.log(`   🔒 Env-only: ${envOnlyChecked}`);
    console.log(`   ❌ Mismatches: ${mismatches}`);
    console.log(`   ⚠️  Missing: ${missing}`);

    if (mismatches > 0 || missing > 0) {
        console.log(`\n⚠️  WARNING: .env and database are NOT in sync!`);
        console.log(`   Run: node scripts/sync-env.js`);
        process.exit(1);
    } else {
        console.log(`\n✅ SUCCESS: .env and database are in perfect sync!`);
    }
}

async function main() {
    const args = process.argv.slice(2);

    try {
        if (args.includes('--from-db')) {
            await syncDatabaseToEnv();
        } else if (args.includes('--validate')) {
            await validateSync();
        } else {
            // Default: sync .env → database
            await syncEnvToDatabase();
        }

        console.log('\n✅ Sync complete!');
    } catch (error) {
        console.error('\n❌ Sync failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
