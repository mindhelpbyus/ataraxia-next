
require('dotenv').config({ path: '../.env' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { PrismaClient } = require('@prisma/client');

// Initialize Firebase Admin
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const app = initializeApp({
    credential: cert(serviceAccount),
});
const auth = getAuth(app);
const prisma = new PrismaClient();

const users = [
    {
        email: 'superadmin@ataraxia.com',
        password: 'Password123!',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin'
    },
    {
        email: 'therapist@ataraxia.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Therapist',
        role: 'therapist'
    },
    {
        email: 'client@ataraxia.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Client',
        role: 'client'
    }
];

async function seed() {
    console.log('🌱 Seeding test users...');

    for (const u of users) {
        try {
            // 1. Create or Get User in Firebase
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(u.email);
                console.log(`- Firebase: User ${u.email} already exists. Updating...`);
                // Ensure email is verified
                await auth.updateUser(userRecord.uid, {
                    emailVerified: true,
                    password: u.password, // Reset password to known value
                    disabled: false
                });
            } catch (e) {
                if (e.code === 'auth/user-not-found') {
                    console.log(`- Firebase: Creating new user ${u.email}...`);
                    userRecord = await auth.createUser({
                        email: u.email,
                        password: u.password,
                        displayName: `${u.firstName} ${u.lastName}`,
                        emailVerified: true, // Auto-verify
                        disabled: false
                    });
                } else {
                    throw e;
                }
            }

            // 2. Set Custom Claims
            await auth.setCustomUserClaims(userRecord.uid, {
                role: u.role,
                firstName: u.firstName,
                lastName: u.lastName
            });

            // 3. Create or Update in Database
            const dbUser = await prisma.users.upsert({
                where: { email: u.email },
                update: {
                    auth_provider_id: userRecord.uid,
                    first_name: u.firstName,
                    last_name: u.lastName,
                    role: u.role,
                    email_verified: true,
                    is_verified: true,
                    account_status: 'active',
                    current_auth_provider: 'firebase'
                },
                create: {
                    email: u.email,
                    auth_provider_id: userRecord.uid,
                    first_name: u.firstName,
                    last_name: u.lastName,
                    role: u.role,
                    email_verified: true,
                    is_verified: true,
                    account_status: 'active',
                    current_auth_provider: 'firebase',
                    signup_source: 'seed_script',
                    signup_platform: 'backend'
                }
            });

            console.log(`✅ Seeded ${u.role}: ${u.email} / ${u.password}`);

        } catch (error) {
            console.error(`❌ Failed to seed ${u.email}:`, error.message);
        }
    }

    console.log('\n✨ Seeding complete. You can now login with these credentials.');
    process.exit(0);
}

seed();
