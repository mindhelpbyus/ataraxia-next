/**
 * Prisma Client Singleton
 * Ensures single instance across Lambda functions
 */
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    // Create a simple Prisma client for direct PostgreSQL connection
    prisma = new PrismaClient({
      log: process.env.LOG_LEVEL === 'debug' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
      errorFormat: 'pretty',
    });

    // Handle connection errors
    (prisma as any).$on('error', (e: any) => {
      console.error('Prisma error:', e);
    });
  }

  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export default getPrisma;