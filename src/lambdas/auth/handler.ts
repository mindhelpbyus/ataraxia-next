/**
 * Auth Lambda Handler - Complete Cognito + PostgreSQL Authentication System
 * 
 * Handles all authentication operations including:
 * - User login and registration
 * - Password reset and change
 * - Phone and Google OAuth
 * - Therapist registration workflow
 * - JWT token verification
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  RespondToAuthChallengeCommand,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AuthFlowType,
  ChallengeNameType
} from '@aws-sdk/client-cognito-identity-provider';
import { query, queryOne } from '../../lib/database';
import { createLogger, PerformanceMonitor } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import { verifyJWT } from '../../shared/auth';

const logger = createLogger('auth-service');

// AWS Cognito Configuration
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_xeXlyFBMH',
  clientId: process.env.COGNITO_CLIENT_ID || '7ek8kg1td2ps985r21m7727q98',
  region: process.env.AWS_REGION || 'us-west-2'
};

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_CONFIG.region,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  })
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const path = event.path;
  const method = event.httpMethod;
  
  const logContext = {
    requestId,
    path,
    method,
    userAgent: event.headers['User-Agent'],
    ip: event.requestContext.identity.sourceIp
  };

  logger.info('Auth request received', logContext);

  try {
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return successResponse({}, 'CORS preflight', requestId);
    }

    // Authentication endpoints
    if (path.includes('/auth/login') && method === 'POST') {
      return await handleLogin(event, requestId, logContext);
    }

    if (path.includes('/auth/register') && method === 'POST') {
      return await handleRegister(event, requestId, logContext);
    }

    if (path.includes('/auth/confirm') && method === 'POST') {
      return await handleConfirmSignUp(event, requestId, logContext);
    }

    if (path.includes('/auth/resend-code') && method === 'POST') {
      return await handleResendConfirmationCode(event, requestId, logContext);
    }

    if (path.includes('/auth/forgot-password') && method === 'POST') {
      return await handleForgotPassword(event, requestId, logContext);
    }

    if (path.includes('/auth/confirm-new-password') && method === 'POST') {
      return await handleConfirmNewPassword(event, requestId, logContext);
    }

    if (path.includes('/auth/phone/send-code') && method === 'POST') {
      return await handleSendPhoneCode(event, requestId, logContext);
    }

    if (path.includes('/auth/phone/verify-code') && method === 'POST') {
      return await handleVerifyPhoneCode(event, requestId, logContext);
    }

    if (path.includes('/auth/google') && method === 'POST') {
      return await handleGoogleAuth(event, requestId, logContext);
    }

    if (path.includes('/auth/therapist/register') && method === 'POST') {
      return await handleTherapistRegistration(event, requestId, logContext);
    }

    if (path.includes('/auth/me') && method === 'GET') {
      return await handleGetCurrentUser(event, requestId, logContext);
    }

    // Add missing status endpoint for backward compatibility
    if (path.match(/^\/auth\/therapist\/status\/[\w-]+$/) && method === 'GET') {
      const authProviderId = path.split('/').pop();
      return await handleGetTherapistStatus(authProviderId!, requestId, logContext);
    }

    if (path.includes('/auth/logout') && method === 'POST') {
      return await handleLogout(event, requestId, logContext);
    }

    return errorResponse(404, `Route not found: ${method} ${path}`, requestId);

  } catch (error: any) {
    logger.error('Auth Lambda Error', logContext, error);
    return errorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Handle therapist status check (for backward compatibility)
 */
async function handleGetTherapistStatus(
  authProviderId: string,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_therapist_status', { ...logContext, authProviderId });
  
  try {
    // First check if user exists in main users table
    const user = await queryOne(
      'SELECT id, email, first_name, last_name, account_status, is_verified FROM users WHERE auth_provider_id = $1',
      [authProviderId]
    );

    if (user) {
      monitor.end(true);
      return successResponse({
        success: true,
        status: 'active',
        user,
        canLogin: user.account_status === 'active',
        message: user.account_status === 'active'
          ? 'Your account is active. You can login.'
          : 'Your account is not active. Please contact support.'
      }, 'User status retrieved', requestId);
    }

    // Check temp registrations using the database function
    const status = await queryOne('SELECT * FROM get_registration_status($1)', [authProviderId]);

    if (!status) {
      monitor.end(false);
      return errorResponse(404, 'No registration found. Please register first.', requestId);
    }

    monitor.end(true);
    return successResponse({
      success: true,
      registration: {
        id: status.registration_id,
        status: status.status,
        workflowStage: status.workflow_stage,
        backgroundCheckStatus: status.background_check_status,
        canLogin: status.can_login,
        message: status.message
      },
      canLogin: status.can_login,
      message: status.message
    }, 'Registration status retrieved', requestId);

  } catch (error: any) {
    logger.error('Get therapist status error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to get registration status', requestId);
  }
}

/**
 * Handle user login
 */
async function handleLogin(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'login', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    if (!email || !password) {
      return validationErrorResponse('Email and password are required', requestId);
    }

    // Initiate auth with Cognito
    const authCommand = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: COGNITO_CONFIG.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    const authResult = await cognitoClient.send(authCommand);

    if (authResult.ChallengeName) {
      // Handle auth challenges (e.g., NEW_PASSWORD_REQUIRED)
      monitor.end(false);
      return successResponse({
        challengeName: authResult.ChallengeName,
        session: authResult.Session,
        challengeParameters: authResult.ChallengeParameters,
        message: 'Authentication challenge required'
      }, 'Challenge required', requestId);
    }

    if (!authResult.AuthenticationResult?.IdToken) {
      monitor.end(false);
      return errorResponse(401, 'Authentication failed', requestId);
    }

    // Get user from database
    const cognitoSub = extractSubFromToken(authResult.AuthenticationResult.IdToken);
    const user = await queryOne(
      'SELECT * FROM users WHERE auth_provider_id = $1 AND auth_provider_type = $2',
      [cognitoSub, 'cognito']
    );

    if (!user) {
      monitor.end(false);
      return errorResponse(404, 'User not found in database', requestId);
    }

    monitor.end(true);
    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        accountStatus: user.account_status
      },
      tokens: {
        idToken: authResult.AuthenticationResult.IdToken,
        accessToken: authResult.AuthenticationResult.AccessToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken
      },
      message: 'Login successful'
    }, 'Login successful', requestId);

  } catch (error: any) {
    logger.error('Login error', logContext, error);
    monitor.end(false);
    
    if (error.name === 'NotAuthorizedException') {
      return errorResponse(401, 'Invalid email or password', requestId);
    }
    if (error.name === 'UserNotConfirmedException') {
      return errorResponse(400, 'Please confirm your email address first', requestId);
    }
    
    return errorResponse(500, 'Login failed', requestId);
  }
}

/**
 * Handle user registration
 */
async function handleRegister(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'register', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password, firstName, lastName, phoneNumber, countryCode = '+1', role = 'client' } = body;

    if (!email || !password || !firstName || !lastName) {
      return validationErrorResponse('Email, password, firstName, and lastName are required', requestId);
    }

    // Sign up with Cognito
    const signUpCommand = new SignUpCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
        ...(phoneNumber ? [{ Name: 'phone_number', Value: `${countryCode}${phoneNumber}` }] : [])
      ]
    });

    const signUpResult = await cognitoClient.send(signUpCommand);

    // Create user in database
    const user = await queryOne(
      `INSERT INTO users (
         auth_provider_id, auth_provider_type, email, phone_number,
         first_name, last_name, role, account_status, is_verified, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, email, first_name, last_name, role, account_status`,
      [
        signUpResult.UserSub, 'cognito', email, phoneNumber,
        firstName, lastName, role, 'pending_verification', false, false
      ]
    );

    monitor.end(true);
    return successResponse({
      user,
      needsConfirmation: !signUpResult.UserConfirmed,
      message: signUpResult.UserConfirmed 
        ? 'Registration successful' 
        : 'Registration successful. Please check your email for confirmation code.'
    }, 'Registration successful', requestId);

  } catch (error: any) {
    logger.error('Registration error', logContext, error);
    monitor.end(false);
    
    if (error.name === 'UsernameExistsException') {
      return errorResponse(409, 'User already exists', requestId);
    }
    if (error.name === 'InvalidPasswordException') {
      return errorResponse(400, 'Password does not meet requirements', requestId);
    }
    
    return errorResponse(500, 'Registration failed', requestId);
  }
}

/**
 * Handle therapist registration
 */
async function handleTherapistRegistration(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'therapist_registration', logContext);
  
  try {
    // Verify JWT token
    const authResult = await verifyJWT(event.headers.Authorization);
    if (!authResult.success) {
      return errorResponse(401, authResult.error || 'Unauthorized', requestId);
    }

    const body = JSON.parse(event.body || '{}');
    const {
      // Basic Information
      email, phoneNumber, countryCode = '+1',
      firstName, lastName, dateOfBirth, gender,
      
      // Address
      address1, address2, city, state, zipCode, country = 'US',
      timezone = 'America/New_York',
      
      // Profile
      languages = [], profilePhotoUrl, selectedAvatarUrl, headshotUrl,
      
      // Professional
      degree, institutionName, graduationYear, yearsOfExperience = 0,
      bio, specializations = [],
      
      // Enhanced Professional
      clinicalSpecialties = {}, lifeContextSpecialties = {},
      therapeuticModalities = {}, personalStyle = {},
      demographicPreferences = {},
      
      // License
      licenseNumber, licenseState, licenseType, licenseExpiry,
      licenseDocumentUrl, npiNumber, licensingAuthority,
      
      // Insurance & Malpractice
      malpracticeInsuranceProvider, malpracticePolicyNumber,
      malpracticeExpiry, malpracticeDocumentUrl,
      
      // Documents
      degreeCertificateUrl, photoIdUrl, w9DocumentUrl,
      hipaaDocumentUrl, ethicsDocumentUrl, backgroundCheckDocumentUrl,
      
      // Practice
      sessionFormats = {}, newClientsCapacity = 0, maxCaseloadCapacity = 0,
      clientIntakeSpeed, emergencySameDayCapacity = false,
      preferredSchedulingDensity, weeklySchedule = {}, sessionDurations = [],
      
      // Insurance & Compliance
      insurancePanelsAccepted = [], medicaidAcceptance = false,
      medicareAcceptance = false, selfPayAccepted = false,
      slidingScale = false, employerEaps = [],
      
      // Compliance
      hipaaTrainingCompleted = false, ethicsCertification = false,
      signedBaa = false, backgroundCheckConsent = false,
      
      // Profile Content
      shortBio, extendedBio, whatClientsCanExpected, myApproachToTherapy,
      
      // Organization
      orgInviteCode
    } = body;

    const authProviderId = authResult.user!.sub;

    // Validate required fields
    if (!firstName || !lastName || !licenseNumber || !licenseState) {
      return validationErrorResponse('Missing required fields: firstName, lastName, licenseNumber, licenseState', requestId);
    }

    // Check for existing registration
    const existingReg = await queryOne(
      'SELECT id, registration_status FROM temp_therapist_registrations WHERE auth_provider_id = $1',
      [authProviderId]
    );

    if (existingReg) {
      if (existingReg.registration_status === 'approved') {
        return errorResponse(400, 'Account already approved. Please login.', requestId);
      } else if (existingReg.registration_status !== 'rejected') {
        return errorResponse(400, 'Registration already submitted. Please check your email for status updates.', requestId);
      }
    }

    // Handle organization registration path
    if (orgInviteCode) {
      const inviteResult = await queryOne(
        `SELECT oi.*, o.name as org_name 
         FROM organization_invites oi
         JOIN organizations o ON oi.organization_id = o.id
         WHERE oi.invite_code = $1 
         AND oi.status = 'active'
         AND (oi.expires_at IS NULL OR oi.expires_at > NOW())
         AND (oi.max_uses IS NULL OR oi.current_uses < oi.max_uses)`,
        [orgInviteCode]
      );

      if (!inviteResult) {
        return errorResponse(400, 'Invalid or expired invite code', requestId);
      }

      // Update user to active status (pre-approved)
      await query(
        `UPDATE users 
         SET organization_id = $1, account_status = 'active', 
             is_verified = true, is_active = true, verified_at = NOW()
         WHERE auth_provider_id = $2`,
        [inviteResult.organization_id, authProviderId]
      );

      // Update invite usage
      await query(
        `UPDATE organization_invites
         SET current_uses = current_uses + 1,
             used_by = (SELECT id FROM users WHERE auth_provider_id = $1),
             used_at = NOW(),
             status = CASE 
                 WHEN current_uses + 1 >= max_uses THEN 'used'
                 ELSE 'active'
             END
         WHERE id = $2`,
        [authProviderId, inviteResult.id]
      );

      monitor.end(true);
      return successResponse({
        organization: inviteResult.org_name,
        canLogin: true,
        message: 'Registration complete via organization invite!'
      }, 'Organization registration successful', requestId);
    }

    // Solo therapist registration - save to temp table
    const normalizeDate = (dateValue: any, useDefault: boolean = false): string | null => {
      if (!dateValue || dateValue === '' || dateValue === 'null' || dateValue === 'undefined') {
        return useDefault ? '2099-12-31' : null;
      }
      return dateValue;
    };

    // Get user ID
    const user = await queryOne(
      'SELECT id FROM users WHERE auth_provider_id = $1',
      [authProviderId]
    );

    if (!user) {
      return errorResponse(404, 'User not found', requestId);
    }

    // Insert temp registration
    const regResult = await queryOne(
      `INSERT INTO temp_therapist_registrations (
         user_id, auth_provider_id, auth_provider_type, email, phone_number, phone_country_code,
         first_name, last_name, date_of_birth, gender,
         address_line1, address_line2, city, state, zip_code, country, timezone,
         languages_spoken, profile_photo_url, selected_avatar_url, headshot_url,
         degree, institution_name, graduation_year, years_of_experience, bio, specializations,
         clinical_specialties, life_context_specialties, therapeutic_modalities, 
         personal_style, demographic_preferences,
         license_number, license_state, license_type, license_expiry,
         license_document_url, npi_number, licensing_authority,
         malpractice_insurance_provider, malpractice_policy_number, malpractice_expiry,
         malpractice_document_url, degree_certificate_url, photo_id_url,
         w9_document_url, hipaa_document_url, ethics_document_url, background_check_document_url,
         session_formats, new_clients_capacity, max_caseload_capacity,
         client_intake_speed, emergency_same_day_capacity, preferred_scheduling_density,
         weekly_schedule, session_durations,
         insurance_panels_accepted, medicaid_acceptance, medicare_acceptance,
         self_pay_accepted, sliding_scale, employer_eaps,
         hipaa_training_completed, ethics_certification, signed_baa,
         background_check_consent, background_check_consent_date,
         short_bio, extended_bio, what_clients_can_expect, my_approach_to_therapy,
         registration_status, workflow_stage, background_check_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
         $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
         $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62,
         $63, $64, $65, $66, $67, $68, $69, 'pending_review', 'registration_submitted', 'not_started'
       )
       ON CONFLICT (user_id) DO UPDATE
         SET auth_provider_id = EXCLUDED.auth_provider_id,
             email = EXCLUDED.email,
             phone_number = EXCLUDED.phone_number,
             updated_at = NOW()
       RETURNING id, registration_status, workflow_stage`,
      [
        user.id, authProviderId, 'cognito', email, phoneNumber, countryCode,
        firstName, lastName, normalizeDate(dateOfBirth), gender,
        address1, address2, city, state, zipCode, country, timezone,
        JSON.stringify(languages), profilePhotoUrl, selectedAvatarUrl, headshotUrl,
        degree, institutionName, graduationYear, yearsOfExperience, bio, JSON.stringify(specializations),
        JSON.stringify(clinicalSpecialties), JSON.stringify(lifeContextSpecialties),
        JSON.stringify(therapeuticModalities), JSON.stringify(personalStyle), JSON.stringify(demographicPreferences),
        licenseNumber, licenseState, licenseType, normalizeDate(licenseExpiry, true),
        licenseDocumentUrl, npiNumber, licensingAuthority,
        malpracticeInsuranceProvider, malpracticePolicyNumber, normalizeDate(malpracticeExpiry, true),
        malpracticeDocumentUrl, degreeCertificateUrl, photoIdUrl,
        w9DocumentUrl, hipaaDocumentUrl, ethicsDocumentUrl, backgroundCheckDocumentUrl,
        JSON.stringify(sessionFormats), newClientsCapacity, maxCaseloadCapacity,
        clientIntakeSpeed, emergencySameDayCapacity, preferredSchedulingDensity,
        JSON.stringify(weeklySchedule), JSON.stringify(sessionDurations),
        JSON.stringify(insurancePanelsAccepted), medicaidAcceptance, medicareAcceptance,
        selfPayAccepted, slidingScale, JSON.stringify(employerEaps),
        hipaaTrainingCompleted, ethicsCertification, signedBaa,
        backgroundCheckConsent, backgroundCheckConsent ? new Date() : null,
        shortBio, extendedBio, whatClientsCanExpected, myApproachToTherapy
      ]
    );

    // Update user verification stage
    await query(
      `UPDATE users 
       SET account_status = 'pending_verification', 
           verification_stage = 'registration_submitted',
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Log workflow action
    await query(
      `INSERT INTO verification_workflow_log (
         user_id, temp_registration_id, workflow_stage, action, status, performed_by_type
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, regResult.id, 'registration_submitted', 'registration_created', 'success', 'system']
    );

    monitor.end(true);
    return successResponse({
      registrationId: regResult.id,
      status: regResult.registration_status,
      workflowStage: regResult.workflow_stage,
      canLogin: false,
      message: 'Registration submitted successfully. You will be notified once your application is reviewed.',
      estimatedTime: '2-5 business days'
    }, 'Registration submitted successfully', requestId);

  } catch (error: any) {
    logger.error('Therapist registration error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to submit registration', requestId);
  }
}

/**
 * Handle confirm sign up
 */
async function handleConfirmSignUp(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'confirm_signup', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email, confirmationCode } = body;

    if (!email || !confirmationCode) {
      return validationErrorResponse('Email and confirmation code are required', requestId);
    }

    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      ConfirmationCode: confirmationCode
    });

    await cognitoClient.send(confirmCommand);

    // Update user status in database
    await query(
      'UPDATE users SET is_verified = true, account_status = $1 WHERE email = $2 AND auth_provider_type = $3',
      ['active', email, 'cognito']
    );

    monitor.end(true);
    return successResponse({
      message: 'Email confirmed successfully'
    }, 'Email confirmed', requestId);

  } catch (error: any) {
    logger.error('Confirm signup error', logContext, error);
    monitor.end(false);
    
    if (error.name === 'CodeMismatchException') {
      return errorResponse(400, 'Invalid confirmation code', requestId);
    }
    if (error.name === 'ExpiredCodeException') {
      return errorResponse(400, 'Confirmation code has expired', requestId);
    }
    
    return errorResponse(500, 'Email confirmation failed', requestId);
  }
}

/**
 * Handle resend confirmation code
 */
async function handleResendConfirmationCode(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'resend_confirmation', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email } = body;

    if (!email) {
      return validationErrorResponse('Email is required', requestId);
    }

    const resendCommand = new ResendConfirmationCodeCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email
    });

    await cognitoClient.send(resendCommand);

    monitor.end(true);
    return successResponse({
      message: 'Confirmation code sent successfully'
    }, 'Confirmation code sent', requestId);

  } catch (error: any) {
    logger.error('Resend confirmation error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to resend confirmation code', requestId);
  }
}

/**
 * Handle forgot password
 */
async function handleForgotPassword(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'forgot_password', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email } = body;

    if (!email) {
      return validationErrorResponse('Email is required', requestId);
    }

    const forgotCommand = new ForgotPasswordCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email
    });

    await cognitoClient.send(forgotCommand);

    monitor.end(true);
    return successResponse({
      message: 'Password reset code sent to your email'
    }, 'Password reset initiated', requestId);

  } catch (error: any) {
    logger.error('Forgot password error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to initiate password reset', requestId);
  }
}

/**
 * Handle confirm new password
 */
async function handleConfirmNewPassword(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'confirm_new_password', logContext);
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { email, confirmationCode, newPassword } = body;

    if (!email || !confirmationCode || !newPassword) {
      return validationErrorResponse('Email, confirmation code, and new password are required', requestId);
    }

    const confirmCommand = new ConfirmForgotPasswordCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    });

    await cognitoClient.send(confirmCommand);

    monitor.end(true);
    return successResponse({
      message: 'Password reset successfully'
    }, 'Password reset completed', requestId);

  } catch (error: any) {
    logger.error('Confirm new password error', logContext, error);
    monitor.end(false);
    
    if (error.name === 'CodeMismatchException') {
      return errorResponse(400, 'Invalid confirmation code', requestId);
    }
    if (error.name === 'InvalidPasswordException') {
      return errorResponse(400, 'Password does not meet requirements', requestId);
    }
    
    return errorResponse(500, 'Password reset failed', requestId);
  }
}

/**
 * Handle get current user
 */
async function handleGetCurrentUser(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_current_user', logContext);
  
  try {
    const authResult = await verifyJWT(event.headers.Authorization);
    if (!authResult.success) {
      return errorResponse(401, authResult.error || 'Unauthorized', requestId);
    }

    const user = await queryOne(
      'SELECT * FROM users WHERE auth_provider_id = $1 AND auth_provider_type = $2',
      [authResult.user!.sub, 'cognito']
    );

    if (!user) {
      return errorResponse(404, 'User not found', requestId);
    }

    monitor.end(true);
    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        accountStatus: user.account_status,
        isVerified: user.is_verified,
        isActive: user.is_active
      }
    }, 'Current user retrieved', requestId);

  } catch (error: any) {
    logger.error('Get current user error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to get current user', requestId);
  }
}

/**
 * Handle logout
 */
async function handleLogout(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'logout', logContext);
  
  try {
    // For Cognito, logout is typically handled client-side by discarding tokens
    // Server-side logout would require token revocation which needs additional setup
    
    monitor.end(true);
    return successResponse({
      message: 'Logout successful'
    }, 'Logout completed', requestId);

  } catch (error: any) {
    logger.error('Logout error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Logout failed', requestId);
  }
}

/**
 * Handle send phone code (placeholder for SMS verification)
 */
async function handleSendPhoneCode(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  // TODO: Implement SMS verification with AWS SNS
  return successResponse({ 
    message: 'SMS verification not yet implemented. Use email verification.' 
  }, 'SMS verification pending', requestId);
}

/**
 * Handle verify phone code (placeholder for SMS verification)
 */
async function handleVerifyPhoneCode(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  // TODO: Implement SMS code verification
  return successResponse({ 
    message: 'SMS verification not yet implemented. Use email verification.' 
  }, 'SMS verification pending', requestId);
}

/**
 * Handle Google auth (placeholder for OAuth integration)
 */
async function handleGoogleAuth(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  // TODO: Implement Google OAuth with Cognito Identity Pools
  return successResponse({ 
    message: 'Google OAuth not yet implemented. Use email/password authentication.' 
  }, 'Google OAuth pending', requestId);
}

/**
 * Extract sub from JWT token (simplified)
 */
function extractSubFromToken(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch (error) {
    throw new Error('Invalid token');
  }
}