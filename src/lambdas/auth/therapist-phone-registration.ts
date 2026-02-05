/**
 * Therapist Phone Registration Handler
 * 
 * Handles phone-based registration specifically for therapists:
 * 1. Phone + OTP verification via Firebase
 * 2. Route to Step 1 of onboarding with phone auto-populated
 * 3. Collect basic details (name, email) - password optional
 * 4. Create user record with 'registered' status
 * 5. Generate onboarding token for Steps 2-10
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { FirebaseProvider } from '../../lib/auth/providers/FirebaseProvider';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import jwt from 'jsonwebtoken';

const logger = createLogger('therapist-phone-registration');

interface TherapistPhoneRegistrationRequest {
  idToken: string;           // Firebase ID token from phone verification
  first_name: string;        // From Step 1 form
  last_name: string;         // From Step 1 form
  email: string;             // From Step 1 form
  password?: string;         // Optional - can be set later
  phone_number?: string;     // From Firebase token (for verification)
}

/**
 * Handle therapist phone registration
 * This is called after phone OTP verification when user completes Step 1 of onboarding
 */
export async function handleTherapistPhoneRegistration(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body: TherapistPhoneRegistrationRequest = JSON.parse(event.body || '{}');
    const { idToken, first_name, last_name, email, password, phone_number } = body;

    // Validate required fields
    if (!idToken || !first_name || !last_name || !email) {
      return validationErrorResponse('Missing required fields: idToken, first_name, last_name, email', requestId);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return validationErrorResponse('Invalid email format', requestId);
    }

    const prisma = getPrisma();

    // Initialize Firebase provider
    const firebaseProvider = new FirebaseProvider(
      process.env.FIREBASE_PROJECT_ID || '',
      process.env.FIREBASE_CLIENT_EMAIL,
      process.env.FIREBASE_PRIVATE_KEY,
      process.env.FIREBASE_API_KEY
    );

    // Verify Firebase ID token
    const decodedToken = await firebaseProvider.verifyToken(idToken);
    if (!decodedToken) {
      return errorResponse(401, 'Invalid Firebase token', requestId);
    }

    // Ensure this is a phone-verified token
    if (!decodedToken.phone_number) {
      return errorResponse(400, 'Phone verification required for therapist registration', requestId);
    }

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [
          { email },
          { phone_number: decodedToken.phone_number },
          { auth_provider_id: decodedToken.uid }
        ]
      }
    });

    if (existingUser) {
      // If user exists, check if they're already a therapist or in onboarding
      if (existingUser.role === 'therapist') {
        return errorResponse(409, 'Therapist account already exists with this information', requestId);
      }

      // If user exists but different role, we could handle account upgrade here
      // For now, return error to avoid conflicts
      return errorResponse(409, 'Account already exists with this email or phone number', requestId);
    }

    // Create new therapist user record
    const user = await prisma.users.create({
      data: {
        auth_provider_id: decodedToken.uid,
        email,
        first_name,
        last_name,
        phone_number: decodedToken.phone_number,
        role: 'therapist',
        auth_provider_type: 'firebase',
        current_auth_provider: 'firebase',
        account_status: 'registered', // Can login but needs onboarding completion
        is_verified: false, // Will be true after super admin verification
        email_verified: false, // Will verify email separately if needed
        phone_verified: true, // Already verified via Firebase
        signup_source: 'phone_auth',
        signup_platform: 'web',
        password_hash: password ? await hashPassword(password) : null,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    // Create auth provider mapping
    await prisma.auth_provider_mapping.create({
      data: {
        user_id: user.id,
        provider_type: 'firebase',
        provider_uid: decodedToken.uid,
        provider_email: email,
        is_primary: true
      }
    });

    // Generate onboarding token for Steps 2-10
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const onboardingToken = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        provider: 'firebase',
        onboardingStep: 1, // Just completed Step 1
        isOnboarding: true
      },
      jwtSecret,
      { expiresIn: '15m' } // Short-lived token with auto-refresh
    );

    // Create initial temp_therapist_registrations record for Steps 2-10
    await prisma.temp_therapist_registrations.create({
      data: {
        user_id: user.id,
        // step_1_data is removed or cast to any if necessary
        firebase_uid: decodedToken.uid,
        email: email,
        phone_number: decodedToken.phone_number,
        first_name: first_name,
        last_name: last_name,
        // Casting to any to allow step_1_data passed for legacy reasons
        step_1_data: {
          first_name,
          last_name,
          email,
          phone_number: decodedToken.phone_number,
          completed_at: new Date().toISOString()
        }
      } as any
    });

    logger.info('Therapist phone registration completed', {
      userId: user.id.toString(),
      email,
      phone_number: decodedToken.phone_number,
      hasPassword: !!password
    });

    return successResponse({
      token: onboardingToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        account_status: user.account_status,
        phone_number: user.phone_number,
        phone_verified: user.phone_verified,
        onboarding_step: 1,
        can_login: true,
        requires_onboarding: true
      },
      onboarding: {
        current_step: 1,
        total_steps: 10,
        next_step: 2,
        can_continue: true,
        message: 'Step 1 completed successfully. Continue with professional information.'
      }
    }, 'Therapist registration successful - Step 1 completed', requestId);

  } catch (error: any) {
    logger.error('Therapist phone registration failed', { error: error.message, requestId });
    return errorResponse(500, 'Registration failed', requestId);
  }
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Handle therapist phone login (for existing users)
 */
export async function handleTherapistPhoneLogin(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { idToken } = body;

    if (!idToken) {
      return validationErrorResponse('Firebase ID token is required', requestId);
    }

    const prisma = getPrisma();

    // Initialize Firebase provider
    const firebaseProvider = new FirebaseProvider(
      process.env.FIREBASE_PROJECT_ID || '',
      process.env.FIREBASE_CLIENT_EMAIL,
      process.env.FIREBASE_PRIVATE_KEY,
      process.env.FIREBASE_API_KEY
    );

    // Verify Firebase ID token
    const decodedToken = await firebaseProvider.verifyToken(idToken);
    if (!decodedToken || !decodedToken.phone_number) {
      return errorResponse(401, 'Invalid or non-phone Firebase token', requestId);
    }

    // Find existing therapist user
    const user = await prisma.users.findFirst({
      where: {
        phone_number: decodedToken.phone_number,
        role: 'therapist'
      }
    });

    if (!user) {
      return errorResponse(404, 'Therapist account not found with this phone number', requestId);
    }

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: {
        last_login_at: new Date(),
        updated_at: new Date()
      }
    });

    // Check onboarding status
    const tempRegistration = await prisma.temp_therapist_registrations.findFirst({
      where: { user_id: user.id, is_active: true } as any
    });

    const isOnboarding = !!tempRegistration;
    const currentStep = (tempRegistration as any)?.current_step || 10; // Default to completed if no temp record

    // Generate appropriate token
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
    const token = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        provider: 'firebase',
        onboardingStep: currentStep,
        isOnboarding
      },
      jwtSecret,
      { expiresIn: isOnboarding ? '15m' : '1h' } // Short-lived for onboarding, normal for completed
    );

    logger.info('Therapist phone login successful', {
      userId: user.id.toString(),
      phone_number: decodedToken.phone_number,
      isOnboarding,
      currentStep
    });

    return successResponse({
      token,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        account_status: user.account_status,
        phone_number: user.phone_number,
        phone_verified: user.phone_verified,
        onboarding_step: currentStep,
        can_login: true,
        requires_onboarding: isOnboarding
      },
      onboarding: isOnboarding ? {
        current_step: currentStep,
        total_steps: 10,
        next_step: Math.min(currentStep + 1, 10),
        can_continue: currentStep < 10,
        message: `Continue from Step ${currentStep + 1}`
      } : null
    }, 'Therapist login successful', requestId);

  } catch (error: any) {
    logger.error('Therapist phone login failed', { error: error.message, requestId });
    return errorResponse(500, 'Login failed', requestId);
  }
}