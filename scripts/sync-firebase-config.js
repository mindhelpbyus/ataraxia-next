
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient();

async function syncFirebaseConfig() {
    console.log('🔥 Syncing Firebase Config to Database...');

    // 1. Define Configuration Values
    // REPLACE THESE with your actual values if not using prompts
    const config = {
        auth_provider_type: 'firebase', // Switch system to Firebase
        firebase_project_id: process.env.FIREBASE_PROJECT_ID || 'ataraxia-health',
        firebase_client_email: process.env.FIREBASE_CLIENT_EMAIL || 'MISSING_EMAIL',
        firebase_private_key: process.env.FIREBASE_PRIVATE_KEY || 'MISSING_KEY'
    };

    if (config.firebase_client_email === 'MISSING_EMAIL' || config.firebase_private_key === 'MISSING_KEY') {
        console.warn('⚠️  WARNING: Firebase Secrets are missing from environment variables.');
        console.warn('    You must edit this script or set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env');
        console.warn('    Creating placeholders in Database for now...\n');
    }

    // 2. Upsert into system_configs
    const keysToSync = [
        {
            key: 'auth_provider_type',
            value: config.auth_provider_type,
            desc: 'Active Auth Provider (firebase/cognito)'
        },
        {
            key: 'firebase_project_id',
            value: config.firebase_project_id,
            desc: 'Firebase Project ID'
        },
        {
            key: 'firebase_client_email',
            value: config.firebase_client_email,
            desc: 'Firebase Service Account Email'
        },
        {
            key: 'firebase_private_key',
            value: config.firebase_private_key,
            desc: 'Firebase Service Account Private Key'
        }
    ];

    for (const item of keysToSync) {
        try {
            const result = await prisma.system_configs.upsert({
                where: { config_key: item.key },
                update: {
                    config_value: item.value,
                    description: item.desc,
                    updated_at: new Date()
                },
                create: {
                    config_key: item.key,
                    config_value: item.value,
                    description: item.desc
                }
            });
            console.log(`✅ Synced ${item.key}: ${item.value.substring(0, 15)}...`);
        } catch (error) {
            console.error(`❌ Failed to sync ${item.key}:`, error.message);
        }
    }

    console.log('\n🎉 Firebase Config Sync Complete!');
    console.log('💡 Restart the Local API Server to pick up changes (if running).');

    await prisma.$disconnect();
}

syncFirebaseConfig().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
