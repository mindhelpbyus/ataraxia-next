const { PrismaClient } = require('@prisma/client');

// Set environment variable
process.env.DATABASE_URL = "postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia";

async function testPrisma() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing Prisma connection...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');
    
    // Test query
    const userCount = await prisma.users.count();
    console.log(`✅ Found ${userCount} users in database`);
    
    // Test if auth provider fields exist
    const usersWithAuthProvider = await prisma.users.count({
      where: {
        auth_provider_id: { not: null }
      }
    });
    console.log(`✅ Found ${usersWithAuthProvider} users with auth_provider_id`);
    
  } catch (error) {
    console.error('❌ Prisma test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testPrisma();