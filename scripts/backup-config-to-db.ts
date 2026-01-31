
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Backing up configuration to system_configs table...');

    const configs = [
        { key: 'COGNITO_USER_POOL_ID', desc: 'AWS Cognito User Pool ID' },
        { key: 'COGNITO_CLIENT_ID', desc: 'AWS Cognito Client App ID' },
        { key: 'AWS_REGION', desc: 'AWS Region for resources' },
        { key: 'API_GATEWAY_URL', desc: 'Base URL for API Gateway' },
        { key: 'FRONTEND_URL', desc: 'Frontend application URL' },
        { key: 'DATABASE_URL', desc: 'Database Connection String' },
    ];

    for (const config of configs) {
        const value = process.env[config.key];

        if (value) {
            await prisma.system_configs.upsert({
                where: { config_key: config.key },
                update: {
                    config_value: value,
                    description: config.desc,
                    updated_at: new Date()
                },
                create: {
                    config_key: config.key,
                    config_value: value,
                    description: config.desc,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });
            console.log(`✅ Saved ${config.key}`);
        } else {
            console.warn(`⚠️  Missing value for ${config.key} in .env`);
        }
    }

    console.log('✨ Configuration backup complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
