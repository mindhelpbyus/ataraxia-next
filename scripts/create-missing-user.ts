import { getPrisma } from '../src/lib/prisma';

async function createMissingUser() {
    const prisma = getPrisma();

    try {
        // Check if user already exists
        const existingUser = await prisma.users.findFirst({
            where: { email: 'aswinikannagi@atraxia.com' }
        });

        if (existingUser) {
            console.log('✅ User already exists in database:', existingUser);
            return;
        }

        // Create the user
        const user = await prisma.users.create({
            data: {
                auth_provider_id: 'd8c10300-d021-7029-2fd2-23ef7aec4347',
                auth_provider_type: 'cognito',
                email: 'aswinikannagi@atraxia.com',
                first_name: 'ASWINI',
                last_name: 'RANJAN',
                role: 'therapist',
                account_status: 'pending_verification', // Therapist needs verification
                is_verified: true // Email is confirmed in Cognito
            }
        });

        console.log('✅ User created successfully:', user);

        // Create therapist record with minimal required fields
        const therapist = await prisma.therapists.create({
            data: {
                user_id: user.id,
                years_of_experience: 0,
                session_lengths_offered: [],
                accepted_insurances: [],
                languages_spoken: [],
                session_durations: []
            }
        });

        console.log('✅ Therapist record created:', therapist);

    } catch (error) {
        console.error('❌ Error creating user:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

createMissingUser();
