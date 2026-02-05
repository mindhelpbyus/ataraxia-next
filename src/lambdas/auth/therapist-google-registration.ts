/**
 * Therapist Google Registration Handler
 * 
 * Handles Google OAuth-based registration specifically for therapists:
 * 1. Google OAuth verification via Firebase
 * 2. Route to Step 1 of onboarding with Google details auto-populated
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

const logger = createLogger('therapist-google-registration');

interface TherapistGoogleRegistrationRequest {
  idToken: string;           // Firebase ID token from Google OAuth
  first_name: string;        // From Step 1 form
  last_name: string;         // From Step 1 form
  email: string;             // From Step 1 form (auto-populated from Google)
  password?: string;         // Optional - can be set later
}

/**
 * Handle therapist Google registration
 * This is called after Google OAuth verification when user completes Step 1 of onboarding
 */
export async function handleTherapistGoogleRegistration(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body: TherapistGoogleRegistrationRequest = JSON.parse(event.body || '{}');
    const { idToken, first_name, last_name, email, password } = body;

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

    // Ensure this is a Google OAuth token (has email and email_verified)
    if (!decodedToken.email || !decodedToken.email_verified) {
      return errorResponse(400, 'Google OAuth verification required for therapist registration', requestId);
    }

    // Verify the email matches the token
    if (decodedToken.email !== email) {
      return errorResponse(400, 'Email mismatch between token and form data', requestId);
    }

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [
          { email },
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
      return errorResponse(409, 'Account already exists with this email', requestId);
    }

    // Create new therapist user record
    const user = await prisma.users.create({
      data: {
        auth_provider_id: decodedToken.uid,
        email,
        first_name,
        last_name,
        role: 'therapist',
        auth_provider_type: 'firebase',
        current_auth_provider: 'firebase',
        account_status: 'registered', // Can login but needs onboarding completion
        is_verified: false, // Will be true after super admin verification
        email_verified: true, // Already verified via Google OAuth
        phone_verified: false, // No phone verification with Google OAuth
        signup_source: 'google_oauth',
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
        // step_1_data is removed or cast to any if necessary, but here we just pass valid fields or cast to any
        firebase_uid: decodedToken.uid,
        email: email,
        first_name: first_name,
        last_name: last_name,
        // Casting to any to allow step_1_data passed for legacy reasons if schema doesn't support it
        step_1_data: {
          first_name,
          last_name,
          email,
          google_oauth: true,
          completed_at: new Date().toISOString()
        }
      } as any
    });

    logger.info('Therapist Google registration completed', {
      userId: user.id.toString(),
      email,
      hasPassword: !!password,
      googleVerified: true
    });

    return successResponse({
      token: onboardingToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        account_status: user.account_status,
        email_verified: user.email_verified,
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
    }, 'Therapist Google registration successful - Step 1 completed', requestId);

  } catch (error: any) {
    logger.error('Therapist Google registration failed', { error: error.message, requestId });
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