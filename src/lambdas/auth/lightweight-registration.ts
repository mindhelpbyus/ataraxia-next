/**
 * Lightweight Registration Handler
 * 
 * Handles Step 1 user registration for immediate login capability.
 * Creates user record with phone/email tracking for mobile app alignment.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('lightweight-registration');

interface RegistrationRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  countryCode: string;
  role: 'therapist' | 'client';
}

/**
 * Handle Step 1 registration - creates user profile for mobile app alignment
 */
export async function handleLightweightRegistration(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const prisma = getPrisma();

  try {
    const body = JSON.parse(event.body || '{}') as RegistrationRequest;
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      countryCode, // No default, must be provided or null
      role = 'therapist'
    } = body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return validationErrorResponse('Email, password, first name, and last name are required', requestId);
    }

    if (!['therapist', 'client'].includes(role)) {
      return validationErrorResponse('Role must be either "therapist" or "client"', requestId);
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return errorResponse(409, 'User with this email already exists', requestId);
    }

    // Hash password for local authentication
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user record with full profile for mobile app alignment
    const user = await prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role,
        phone_number: phoneNumber,
        country_code: countryCode,
        auth_provider_type: 'local',
        current_auth_provider: 'local',
        account_status: 'registered', // Can login, continue onboarding
        email_verified: true, // Skip email verification for Step 1
        is_verified: true, // Allow immediate login
        is_active: true,
        signup_source: 'web_app',
        signup_platform: 'web',
        onboarding_status: 'in_progress',
        onboarding_step: 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    // Create auth provider mapping for consistency
    await prisma.auth_provider_mapping.create({
      data: {
        user_id: user.id,
        provider_type: 'local',
        provider_uid: user.id.toString(),
        provider_email: email,
        is_primary: true
      }
    });

    // Generate secure short-lived access token (15 minutes)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const accessToken = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        sessionType: 'onboarding'
      },
      jwtSecret,
      { expiresIn: '15m' } // Short-lived for security
    );

    // Create onboarding session in database for tracking
    const sessionId = `onboarding_${user.id}_${Date.now()}`;
    await prisma.user_sessions.create({
      data: {
        session_id: sessionId,
        user_id: user.id,
        user_agent: event.headers['User-Agent'] || 'web-onboarding',
        device_info: { purpose: 'onboarding', userAgent: 'web' },
        ip_address: event.requestContext?.identity?.sourceIp || '127.0.0.1',
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes idle timeout
        is_active: true,
        remember_me: false
      }
    });

    // Create Initial Refresh Token (for rotation)
    const refreshToken = uuidv4();
    await prisma.refresh_tokens.create({
      data: {
        user_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
        created_at: new Date(),
        device_info: { purpose: 'onboarding', userAgent: 'web' },
        ip_address: event.requestContext?.identity?.sourceIp || '127.0.0.1'
      }
    });

    logger.info('Step 1 registration successful - user can now login', {
      userId: user.id.toString(),
      email: user.email,
      role: user.role,
      phoneNumber,
      accountStatus: 'registered'
    });

    // Return response with session info
    return successResponse({
      success: true,
      user: {
        id: user.id.toString(),
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        account_status: user.account_status
      },
      token: accessToken, // Short-lived access token (15 minutes)
      refreshToken: refreshToken, // For rotation
      sessionId: sessionId, // For session tracking
      tokenExpiry: '15m',
      sessionTimeout: '30m',
      canLogin: true,
      continueOnboarding: true,
      message: 'Step 1 complete. User profile created. Continue with onboarding.'
    }, 'Step 1 registration completed', requestId);

  } catch (error: any) {
    logger.error('Lightweight registration failed', { error: error.message });
    return errorResponse(500, 'Registration failed', requestId);
  }
}