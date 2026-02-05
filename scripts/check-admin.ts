import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const admin = await prisma.users.findFirst({ where: { role: 'super_admin' } });
  console.log('Super Admin:', admin);
  const user = await prisma.users.findFirst({ where: { email: 'admin@ataraxia.com' } });
  console.log('Specific Admin:', user);
}
main().catch(console.error).finally(() => prisma.$disconnect());
