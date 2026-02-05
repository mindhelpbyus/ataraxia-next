#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function resetSuperAdminPassword() {
  const prisma = new PrismaClient();
  
  const newPassword = 'SuperAdmin123!'; // You can change this
  const email = 'info@bedrockhealthsolutions.com';

  try {
    console.log('🔐 Resetting super admin password...');
    
    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the super admin password
    const result = await prisma.users.update({
      where: { email },
      data: { password_hash: hashedPassword },
      select: { id: true, email: true, role: true }
    });
    
    console.log('✅ Super admin password reset successful!');
    console.log(`📧 Email: ${result.email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    console.log(`👑 Role: ${result.role}`);
    console.log(`🆔 User ID: ${result.id}`);
    
  } catch (error) {
    console.error('❌ Password reset failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetSuperAdminPassword();