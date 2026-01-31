
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const REGION = process.env.AWS_REGION || 'us-west-2';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

if (!USER_POOL_ID) {
    console.error('❌ COGNITO_USER_POOL_ID not found in .env');
    process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: REGION });

async function createSuperAdmin(email: string) {
    console.log(`🚀 Promoting ${email} to Super Admin...`);
    console.log(`   Region: ${REGION}`);
    console.log(`   UserPool: ${USER_POOL_ID}`);

    try {
        // 1. Add to superadmins group
        console.log('1️⃣  Adding to superadmins group...');
        try {
            await client.send(new AdminAddUserToGroupCommand({
                UserPoolId: USER_POOL_ID,
                Username: email,
                GroupName: 'superadmins'
            }));
            console.log('   ✅ Added to group');
        } catch (error: any) {
            if (error.name === 'UserNotFoundException') {
                console.error(`   ❌ User ${email} not found. Please register via the app first.`);
                return;
            }
            console.error('   Error adding to group:', error.message);
            throw error;
        }

        // 2. Update role attribute
        console.log('2️⃣  Updating custom:role attribute...');
        await client.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: [
                { Name: 'custom:role', Value: 'superadmin' },
                { Name: 'email_verified', Value: 'true' } // Auto-verify email
            ]
        }));
        console.log('   ✅ Attribute updated');

        console.log('\n🎉 Success! User is now a Super Admin.');
        console.log('   You can now login with this email and access the Super Admin Dashboard.');

    } catch (error: any) {
        console.error('\n❌ Failed to promote user:', error.message);
    }
}

const email = process.argv[2];
if (!email) {
    console.log('\nUsage: npx ts-node scripts/make-super-admin.ts <email>');
    console.log('Example: npx ts-node scripts/make-super-admin.ts admin@ataraxia.com\n');
    process.exit(1);
}

createSuperAdmin(email);
