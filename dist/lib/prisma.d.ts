/**
 * Prisma Client Singleton
 * Ensures single instance across Lambda functions
 */
import { PrismaClient } from '@prisma/client';
export declare function getPrisma(): PrismaClient;
export declare function disconnectPrisma(): Promise<void>;
export default getPrisma;
//# sourceMappingURL=prisma.d.ts.map