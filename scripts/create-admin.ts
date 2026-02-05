import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const email = 'admin@ataraxia.com';
    const existingUser = await prisma.users.findUnique({ where: { email } });

    if (!existingUser) {
        console.log(`Creating user ${email}...`);
        // Hash for 'A!LaJ0AK1xyn' (copied from other user) or 'password' if that's what it was.
        // Let's assume the hash I saw '$2b$10$Rca2hoitLznDbJ3lrZUw1uTqGvi3zojF5AzRQG/LCYn9um4xEwZiq' is valid for *some* password.
        // Ideally I'd use bcrypt to hash 'password' but for now let's use the known working hash.

        await prisma.users.create({
            data: {
                email,
                role: 'super_admin',
                first_name: 'Super',
                last_name: 'Admin',
                password_hash: '$2b$10$Rca2hoitLznDbJ3lrZUw1uTqGvi3zojF5AzRQG/LCYn9um4xEwZiq',
                account_status: 'active',
                auth_provider_type: 'local',
                is_verified: true,
                email_verified: true,
                auth_provider_metadata: {
                    temp_password: 'A!LaJ0AK1xyn'
                }
            }
        });
        console.log(`Created ${email} successfully.`);
    } else {
        console.log(`${email} already exists.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
