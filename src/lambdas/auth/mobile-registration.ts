/**
 * Mobile App Client Registration Handler
 * 
 * Supports minimal profile registration for mobile apps:
 * - Register with just name, phone, email (password optional)
 * - Phone verification via SMS OTP
 * - Secure link generation for profile completion
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { FirebaseProvider } from '../../lib/auth/providers/FirebaseProvider';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import * as crypto from 'crypto';

const logger = createLogger('mobile-registration');

interface MinimalRegistrationRequest {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  password?: string; // Optional - can be set later
}

interface PhoneVerificationRequest {
  phone_number: string;
  code?: string;
}

interface ProfileCompletionToken {
  token: string;
  user_id: bigint;
  expires_at: Date;
  completed: boolean;
}

/**
 * Register client with minimal information
 */
export async function handleMinimalRegistration(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body: MinimalRegistrationRequest = JSON.parse(event.body || '{}');
    const { first_name, last_name, phone_number, email, password } = body;

    // Validate required fields
    if (!first_name || !last_name || !phone_number || !email) {
      return validationErrorResponse('Missing required fields: first_name, last_name, phone_number, email', requestId);
    }

    const prisma = getPrisma();

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [
          { email },
          { phone_number }
        ]
      }
    });

    if (existingUser) {
      return errorResponse(409, 'User already exists with this email or phone number', requestId);
    }

    // Create user with minimal profile
    const user = await prisma.users.create({
      data: {
        email,
        first_name,
        last_name,
        phone_number,
        role: 'client',
        account_status: 'phone_verification_pending',
        current_auth_provider: 'firebase',
        is_active: false, // Activate after phone verification
        signup_source: 'mobile_app',
        signup_platform: 'mobile',
        auth_methods: password ? ['email', 'phone'] : ['phone'],
        password_hash: password ? await hashPassword(password) : null
      }
    });

    // Create client profile
    await prisma.clients.create({
      data: {
        user_id: user.id,
        status: 'active',
        has_insurance: false
      }
    });

    // Generate secure profile completion link
    const completionToken = await generateProfileCompletionToken(user.id);

    // Send phone verification code
    const phoneVerificationResult = await sendPhoneVerificationCode(phone_number);

    logger.info('Minimal registration completed', {
      userId: user.id.toString(),
      email,
      phone_number,
      hasPassword: !!password
    });

    return successResponse({
      user_id: user.id.toString(),
      email,
      phone_number,
      profile_completion_link: `${process.env.FRONTEND_URL}/complete-profile?token=${completionToken.token}`,
      phone_verification_required: true,
      message: 'Registration successful. Please verify your phone number and complete your profile.'
    }, 'Registration successful', requestId);

  } catch (error: any) {
    logger.error('Minimal registration failed', { error: error.message, requestId });
    return errorResponse(500, 'Registration failed', requestId);
  }
}

/**
 * Send phone verification code via SMS
 */
export async function handleSendPhoneCode(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body: PhoneVerificationRequest = JSON.parse(event.body || '{}');
    const { phone_number } = body;

    if (!phone_number) {
      return validationErrorResponse('Phone number is required', requestId);
    }

    const result = await sendPhoneVerificationCode(phone_number);

    if (result.success) {
      return successResponse({
        message: 'Verification code sent successfully',
        phone_number
      }, 'Code sent', requestId);
    } else {
      return errorResponse(400, result.error || 'Failed to send verification code', requestId);
    }

  } catch (error: any) {
    logger.error('Send phone code failed', { error: error.message, requestId });
    return errorResponse(500, 'Failed to send verification code', requestId);
  }
}

/**
 * Verify phone number with SMS code
 */
export async function handleVerifyPhoneCode(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body: PhoneVerificationRequest = JSON.parse(event.body || '{}');
    const { phone_number, code } = body;

    if (!phone_number || !code) {
      return validationErrorResponse('Phone number and verification code are required', requestId);
    }

    const prisma = getPrisma();

    // Verify the code (implementation depends on SMS provider)
    const verificationResult = await verifyPhoneCode(phone_number, code);

    if (!verificationResult.success) {
      return errorResponse(400, 'Invalid or expired verification code', requestId);
    }

    // Update user status
    await prisma.users.updateMany({
      where: { phone_number },
      data: {
        phone_verified: true,
        account_status: 'profile_completion_pending',
        is_active: true // Activate account after phone verification
      }
    });

    // Get the updated user
    const user = await prisma.users.findFirst({
      where: { phone_number }
    });

    if (!user) {
      return errorResponse(404, 'User not found after update', requestId);
    }

    // Update client status
    await prisma.clients.updateMany({
      where: { user_id: user.id },
      data: {
        status: 'active' // Client can now use basic app features
      }
    });

    logger.info('Phone verification completed', {
      userId: user.id.toString(),
      phone_number
    });

    return successResponse({
      user_id: user.id.toString(),
      phone_verified: true,
      can_use_app: true,
      message: 'Phone verified successfully. You can now use the app.'
    }, 'Phone verified', requestId);

  } catch (error: any) {
    logger.error('Phone verification failed', { error: error.message, requestId });
    return errorResponse(500, 'Phone verification failed', requestId);
  }
}

/**
 * Complete profile using secure token
 */
export async function handleCompleteProfile(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const token = event.queryStringParameters?.token;
    const body = JSON.parse(event.body || '{}');

    if (!token) {
      return validationErrorResponse('Profile completion token is required', requestId);
    }

    const prisma = getPrisma();

    // Validate token
    const completionToken = await prisma.profile_completion_tokens.findUnique({
      where: { token },
      include: { users: true }
    });

    if (!completionToken || completionToken.expires_at < new Date() || completionToken.completed) {
      return errorResponse(400, 'Invalid or expired profile completion token', requestId);
    }

    // Update user profile with additional information
    const updatedUser = await prisma.users.update({
      where: { id: completionToken.user_id },
      data: {
        ...body, // Additional profile fields
        account_status: 'active'
      }
    });

    // Mark token as used
    await prisma.profile_completion_tokens.update({
      where: { token },
      data: { completed: true }
    });

    logger.info('Profile completion successful', {
      userId: completionToken.user_id.toString(),
      token
    });

    return successResponse({
      user_id: completionToken.user_id.toString(),
      profile_completed: true,
      message: 'Profile completed successfully'
    }, 'Profile completed', requestId);

  } catch (error: any) {
    logger.error('Profile completion failed', { error: error.message, requestId });
    return errorResponse(500, 'Profile completion failed', requestId);
  }
}

/**
 * Generate secure profile completion token
 */
async function generateProfileCompletionToken(userId: bigint): Promise<ProfileCompletionToken> {
  const prisma = getPrisma();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const completionToken = await prisma.profile_completion_tokens.create({
    data: {
      token,
      user_id: userId,
      expires_at: expiresAt,
      completed: false
    }
  });

  return {
    token,
    user_id: userId,
    expires_at: expiresAt,
    completed: false
  };
}

/**
 * Send SMS verification code
 */
async function sendPhoneVerificationCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code in database with expiration
    const prisma = getPrisma();
    await prisma.phone_verification_codes.upsert({
      where: { phone_number: phoneNumber },
      update: {
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        attempts: 0
      },
      create: {
        phone_number: phoneNumber,
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0
      }
    });

    // TODO: Integrate with SMS provider (AWS SNS, Twilio, etc.)
    // For now, log the code (remove in production)
    logger.info('SMS verification code generated', { phoneNumber, code });

    return { success: true };

  } catch (error: any) {
    logger.error('Failed to send SMS code', { phoneNumber, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Verify phone code
 */
async function verifyPhoneCode(phoneNumber: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrisma();
    
    const storedCode = await prisma.phone_verification_codes.findUnique({
      where: { phone_number: phoneNumber }
    });

    if (!storedCode) {
      return { success: false, error: 'No verification code found' };
    }

    if (storedCode.expires_at < new Date()) {
      return { success: false, error: 'Verification code expired' };
    }

    if ((storedCode.attempts || 0) >= 3) {
      return { success: false, error: 'Too many verification attempts' };
    }

    if (storedCode.code !== code) {
      // Increment attempts
      await prisma.phone_verification_codes.update({
        where: { phone_number: phoneNumber },
        data: { attempts: { increment: 1 } }
      });
      return { success: false, error: 'Invalid verification code' };
    }

    // Delete used code
    await prisma.phone_verification_codes.delete({
      where: { phone_number: phoneNumber }
    });

    return { success: true };

  } catch (error: any) {
    logger.error('Phone code verification failed', { phoneNumber, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Hash password
 */
async function hashPassword(password: string): Promise<string> {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}