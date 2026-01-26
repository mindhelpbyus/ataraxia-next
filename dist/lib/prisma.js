"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
exports.disconnectPrisma = disconnectPrisma;
/**
 * Prisma Client Singleton
 * Ensures single instance across Lambda functions
 */
const client_1 = require("@prisma/client");
let prisma = null;
function getPrisma() {
    if (!prisma) {
        // Create a simple Prisma client for direct PostgreSQL connection
        prisma = new client_1.PrismaClient({
            log: process.env.LOG_LEVEL === 'debug'
                ? ['query', 'error', 'warn']
                : ['error'],
            errorFormat: 'pretty',
        });
        // Handle connection errors
        prisma.$on('error', (e) => {
            console.error('Prisma error:', e);
        });
    }
    return prisma;
}
async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
}
exports.default = getPrisma;
//# sourceMappingURL=prisma.js.map