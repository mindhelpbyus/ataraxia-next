/**
 * Auth Lambda Handler - Hybrid Support (Firebase + Cognito)
 * 
 * Handles authentication supporting both Firebase and Cognito providers simultaneously.
 * Uses DB lookup to route requests to the correct provider for existing users.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { CognitoProvider } from '../../lib/auth/providers/CognitoProvider';
import { FirebaseProvider } from '../../lib/auth/providers/FirebaseProvider';
import { AuthProvider } from '../../lib/auth/AuthProvider';
import { RBACService } from '../../lib/auth/RBACService';
import { MFAService } from '../../lib/auth/MFAService';
import { SecurityService } from '../../lib/auth/SecurityService';
import { SessionService } from '../../lib/auth/SessionService';
import { ComplianceService } from '../../lib/auth/ComplianceService';
import { getConfigManager, AuthConfig } from '../../lib/configManager';
import { createLogger, PerformanceMonitor } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import {
  handleMinimalRegistration as handleMobileRegistration,
  handleSendPhoneCode,
  handleVerifyPhoneCode,
  handleCompleteProfile
} from './mobile-registration';
import { handleLightweightRegistration } from './lightweight-registration'; // Added
import { handleTokenRefresh } from './token-refresh'; // Added
import {
  handleGetTherapistList,
  handleSearchTherapists,
  handleGetClientSessions,
  handleBookAppointment,
  handleGetPaymentHistory
} from '../client/mobile-client';

/**
 * Detect authentication provider type from JWT token
 */
function detectTokenProvider(token: string): 'firebase' | 'cognito' | 'unknown' {
  try {
    // Decode JWT header to identify provider
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());

    // Firebase tokens have 'kid' in header and specific issuer pattern
    if (header.kid && token.includes('securetoken.google.com')) {
      return 'firebase';
    }

    // Cognito tokens have different structure and issuer pattern
    if (token.includes('cognito-idp') || header.alg === 'RS256') {
      return 'cognito';
    }

    // Try to decode payload for more clues
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

    // Firebase has 'firebase' in aud or iss
    if (payload.aud?.includes('firebase') || payload.iss?.includes('securetoken.google.com')) {
      return 'firebase';
    }

    // Cognito has cognito-idp in iss
    if (payload.iss?.includes('cognito-idp')) {
      return 'cognito';
    }

    return 'unknown';
  } catch (error) {
    logger.error('Token detection failed', { error: (error as Error).message });
    return 'unknown';
  }
}

/**
 * Get signup source based on provider type
 */
function getSignupSource(providerType: string): { source: string; platform: string } {
  switch (providerType) {
    case 'firebase':
      return { source: 'web_app', platform: 'web' };
    case 'cognito':
      return { source: 'mobile_app', platform: 'mobile' };
    default:
      return { source: 'unknown', platform: 'unknown' };
  }
}

const logger = createLogger('auth-service');

// Global variables for auth providers and services
let firebaseProvider: FirebaseProvider | undefined;
let cognitoProvider: CognitoProvider | undefined;
let authConfig: AuthConfig | null = null;
let mfaService: MFAService | undefined;
let securityService: SecurityService | undefined;
let sessionService: SessionService | undefined;
let complianceService: ComplianceService | undefined;

async function initializeAuthProviders(): Promise<void> {
  if (authConfig && (firebaseProvider || cognitoProvider) && mfaService && securityService && sessionService && complianceService) {
    return;
  }

  const prisma = getPrisma();
  const configManager = getConfigManager(prisma);

  try {
    authConfig = await configManager.getAuthConfig();
  } catch (error: any) {
    logger.error('Config load failed, using environment fallbacks', { error: error.message });
    // Production fallback config from environment variables (Cognito Primary for Mobile App Compatibility)
    authConfig = {
      authProviderType: process.env.AUTH_PROVIDER_TYPE || 'cognito',
      authProviderDefault: process.env.AUTH_PROVIDER_TYPE || 'cognito',
      enableUniversalAuth: process.env.ENABLE_UNIVERSAL_AUTH === 'true',
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
      cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
      cognitoRegion: process.env.AWS_REGION || 'us-west-2',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
      firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      emailVerificationRequired: true,
      phoneVerificationEnabled: true,
      onboardingStepsTotal: 10,
      onboardingAutoSave: true,
      onboardingBackupInterval: 30000,
      jwtSecret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })(),
      sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '120'), // 2 hours for healthcare
      refreshTokenExpiryDays: parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7'),
      mfaRequired: process.env.ENABLE_MFA === 'true',
      passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '12'),
      passwordRotationDays: 90,
      apiBaseUrl: process.env.API_BASE_URL || '',
      apiTimeout: 30000,
      enableDetailedErrors: process.env.ENABLE_DETAILED_ERRORS === 'true'
    };
  }

  // Initialize Firebase
  if (authConfig.firebaseProjectId) {
    try {
      firebaseProvider = new FirebaseProvider(
        authConfig.firebaseProjectId,
        authConfig.firebaseClientEmail,
        authConfig.firebasePrivateKey,
        authConfig.firebaseApiKey
      );
    } catch (e) {
      logger.error('Failed to initialize Firebase Provider', { error: e });
    }
  }

  // Initialize Cognito
  if (authConfig.cognitoUserPoolId && authConfig.cognitoClientId) {
    try {
      cognitoProvider = new CognitoProvider(
        authConfig.cognitoRegion || 'us-west-2',
        authConfig.cognitoUserPoolId,
        authConfig.cognitoClientId
      );
    } catch (e) {
      logger.error('Failed to initialize Cognito Provider', { error: e });
    }
  }

  // Initialize enhanced auth services
  try {
    mfaService = new MFAService(prisma);
    securityService = new SecurityService(prisma);
    sessionService = new SessionService(prisma);
    complianceService = new ComplianceService(prisma);
  } catch (e) {
    logger.error('Failed to initialize enhanced auth services', { error: e });
  }
}

/**
 * Resolves the correct provider for a user context.
 * 1. If token provided, detect provider from token structure
 * 2. If email provided, check DB for user's current provider
 * 3. Fallback to primary provider (Firebase for web, Cognito for mobile)
 */
async function resolveProvider(email?: string, token?: string): Promise<{ provider: AuthProvider, type: string }> {
  const primaryType = authConfig?.authProviderType || 'firebase';

  // Safety check - ensure we have at least one provider
  const fallback = firebaseProvider || cognitoProvider;
  if (!fallback) throw new Error('No authentication providers are available');

  // 1. Token-based detection (most reliable for login scenarios)
  if (token) {
    const detectedType = detectTokenProvider(token);
    if (detectedType === 'firebase' && firebaseProvider) {
      return { provider: firebaseProvider, type: 'firebase' };
    }
    if (detectedType === 'cognito' && cognitoProvider) {
      return { provider: cognitoProvider, type: 'cognito' };
    }
  }

  // 2. Database lookup for existing users
  if (email) {
    const prisma = getPrisma();
    const user = await prisma.users.findUnique({
      where: { email },
      select: { current_auth_provider: true }
    });

    if (user && user.current_auth_provider) {
      if (user.current_auth_provider === 'firebase' && firebaseProvider) {
        return { provider: firebaseProvider, type: 'firebase' };
      }
      if (user.current_auth_provider === 'cognito' && cognitoProvider) {
        return { provider: cognitoProvider, type: 'cognito' };
      }
    }
  }

  // 3. Fallback to primary provider
  const primary = primaryType === 'firebase' ? firebaseProvider : cognitoProvider;
  const selectedProvider = primary || fallback;
  const selectedType = primary ? primaryType : (cognitoProvider ? 'cognito' : 'firebase');

  return { provider: selectedProvider, type: selectedType };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const path = event.path;
  const method = event.httpMethod;

  const logContext = { requestId, path, method };

  try {
    await initializeAuthProviders();

    if (method === 'OPTIONS') {
      return successResponse({}, 'CORS preflight', requestId);
    }

    if (method === 'POST') {
      if (path.includes('/auth/login') || path.includes('/auth/firebase-login')) {
        return await handleLogin(event, requestId, logContext);
      }
      if (path.includes('/auth/register')) {
        return await handleRegister(event, requestId, logContext);
      }
      if (path.includes('/auth/register-lightweight')) {
        return await handleLightweightRegistration(event, requestId);
      }
      if (path.includes('/auth/confirm')) {
        return await handleConfirmSignUp(event, requestId, logContext);
      }
      if (path.includes('/auth/resend-code')) {
        return await handleResendConfirmationCode(event, requestId, logContext);
      }
      if (path.includes('/auth/forgot-password') || path.includes('/auth/request-password-reset')) {
        return await handleForgotPassword(event, requestId, logContext);
      }
      if (path.includes('/auth/reset-password') || path.includes('/auth/confirm-new-password')) {
        return await handleConfirmNewPassword(event, requestId, logContext);
      }
      if (path.includes('/auth/refresh')) {
        // Use new Secure Token Rotation handler (DB-backed)
        return await handleTokenRefresh(event, requestId);
      }
      if (path.includes('/auth/logout')) {
        return await handleLogout(event, requestId, logContext);
      }

      // MFA endpoints
      if (path.includes('/auth/mfa/setup-totp')) {
        return await handleSetupTOTP(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/verify-totp')) {
        return await handleVerifyTOTP(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/setup-sms')) {
        return await handleSetupSMS(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/verify-sms')) {
        return await handleVerifySMS(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/send-sms-code')) {
        return await handleSendSMSCode(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/regenerate-backup-codes')) {
        return await handleRegenerateBackupCodes(event, requestId, logContext);
      }
      if (path.includes('/auth/mfa/disable')) {
        return await handleDisableMFA(event, requestId, logContext);
      }

      // Session management endpoints
      if (path.includes('/auth/sessions/invalidate-all')) {
        return await handleInvalidateAllSessions(event, requestId, logContext);
      }
      if (path.includes('/auth/sessions/trust-device')) {
        return await handleTrustDevice(event, requestId, logContext);
      }

      // Compliance endpoints
      if (path.includes('/auth/compliance/consent')) {
        return await handleRecordConsent(event, requestId, logContext);
      }
      if (path.includes('/auth/compliance/data-export-request')) {
        return await handleDataExportRequest(event, requestId, logContext);
      }

      // Mobile app registration endpoints
      if (path.includes('/auth/mobile/register')) {
        return await handleMobileRegistration(event, requestId);
      }
      if (path.includes('/auth/mobile/send-phone-code')) {
        return await handleSendPhoneCode(event, requestId);
      }
      if (path.includes('/auth/mobile/verify-phone')) {
        return await handleVerifyPhoneCode(event, requestId);
      }
      if (path.includes('/auth/mobile/complete-profile')) {
        return await handleCompleteProfile(event, requestId);
      }

      // Verification endpoints
      if (path.includes('/auth/check-duplicate')) {
        return await handleCheckDuplicate(event, requestId, logContext);
      }

      // Mobile client booking endpoints
      if (path.includes('/client/book-appointment')) {
        const clientId = event.queryStringParameters?.clientId || JSON.parse(event.body || '{}').clientId;
        if (!clientId) {
          return validationErrorResponse('Client ID is required', requestId);
        }
        return await handleBookAppointment(event, requestId, clientId);
      }
    }

    // ... GET handlers same as before ... 
    if (method === 'GET') {
      if (path.match(/\/auth\/therapist\/status\/[\w-]+$/)) {
        const authId = path.split('/').pop()!;
        return await handleGetTherapistStatus(authId, requestId, logContext);
      }

      // Mobile client endpoints
      if (path.includes('/client/therapists')) {
        const clientId = event.queryStringParameters?.clientId;
        if (!clientId) {
          return validationErrorResponse('Client ID is required', requestId);
        }
        return await handleGetTherapistList(event, requestId, clientId);
      }
      if (path.includes('/client/search')) {
        const clientId = event.queryStringParameters?.clientId;
        if (!clientId) {
          return validationErrorResponse('Client ID is required', requestId);
        }
        return await handleSearchTherapists(event, requestId, clientId);
      }
      if (path.includes('/client/sessions')) {
        const clientId = event.queryStringParameters?.clientId;
        if (!clientId) {
          return validationErrorResponse('Client ID is required', requestId);
        }
        return await handleGetClientSessions(event, requestId, clientId);
      }
      if (path.includes('/client/payments')) {
        const clientId = event.queryStringParameters?.clientId;
        if (!clientId) {
          return validationErrorResponse('Client ID is required', requestId);
        }
        return await handleGetPaymentHistory(event, requestId, clientId);
      }

      // MFA status endpoints
      if (path.includes('/auth/mfa/status')) {
        return await handleGetMFAStatus(event, requestId, logContext);
      }

      // Session management endpoints
      if (path.includes('/auth/sessions/active')) {
        return await handleGetActiveSessions(event, requestId, logContext);
      }
      if (path.includes('/auth/sessions/analytics')) {
        return await handleGetSessionAnalytics(event, requestId, logContext);
      }

      // Compliance endpoints
      if (path.includes('/auth/compliance/consents')) {
        return await handleGetUserConsents(event, requestId, logContext);
      }
      if (path.includes('/auth/compliance/audit-trail')) {
        return await handleGetAuditTrail(event, requestId, logContext);
      }
    }

    return errorResponse(404, `Route not found: ${method} ${path}`, requestId);

  } catch (error: any) {
    logger.error('Auth Lambda Error', logContext, error);
    return errorResponse(500, 'Internal server error', requestId);
  }
};

async function handleLogin(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'login', logContext);
  const prisma = getPrisma();

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password, idToken, mfaToken, deviceInfo } = body;
    const ipAddress = event.requestContext.identity.sourceIp;
    const userAgent = event.headers['User-Agent'] || '';

    // Security checks
    if (!securityService) {
      throw new Error('Security service not initialized');
    }

    // Rate limiting check
    const rateLimitCheck = await securityService.checkRateLimit(email || 'anonymous', 'login', ipAddress);
    if (!rateLimitCheck.allowed) {
      return errorResponse(429, rateLimitCheck.reason || 'Rate limit exceeded', requestId, {
        retryAfter: rateLimitCheck.retryAfter
      });
    }

    let authResponse: any;
    let usedProviderType = 'firebase';

    // Strategy:
    // 1. If idToken: Use token detection to determine provider
    // 2. If password: Resolve provider based on email lookup, with fallback logic

    if (idToken) {
      // Token Flow - detect provider from token structure
      const detectedType = detectTokenProvider(idToken);

      if (detectedType === 'firebase' && firebaseProvider) {
        try {
          const user = await firebaseProvider.verifyToken(idToken);
          authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
          usedProviderType = 'firebase';
        } catch (e) {
          logger.warn('Firebase token verification failed', { error: (e as Error).message });
        }
      } else if (detectedType === 'cognito' && cognitoProvider) {
        try {
          const user = await cognitoProvider.verifyToken(idToken);
          authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
          usedProviderType = 'cognito';
        } catch (e) {
          logger.warn('Cognito token verification failed', { error: (e as Error).message });
        }
      }

      // If token detection failed, try both providers
      if (!authResponse) {
        if (firebaseProvider) {
          try {
            const user = await firebaseProvider.verifyToken(idToken);
            authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
            usedProviderType = 'firebase';
          } catch (e) { /* Try next provider */ }
        }

        if (!authResponse && cognitoProvider) {
          try {
            const user = await cognitoProvider.verifyToken(idToken);
            authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
            usedProviderType = 'cognito';
          } catch (e) { /* Both failed */ }
        }
      }

      if (!authResponse) return errorResponse(401, 'Invalid token', requestId);
    } else {
      // Password Flow - resolve provider based on email
      if (!email || !password) return validationErrorResponse('Email and password required', requestId);

      // 1. Resolve Provider based on email lookup
      const { provider, type } = await resolveProvider(email);

      try {
        authResponse = await provider.signIn(email, password);
        usedProviderType = type;
      } catch (e: any) {
        // 2. Fallback logic: If user not found and universal auth enabled, try other provider
        const isUserNotFound = e.message?.includes('not found') || e.code === 'UserNotFoundException' || e.code === 'auth/user-not-found';

        if (isUserNotFound && authConfig?.enableUniversalAuth) {
          const otherType = type === 'firebase' ? 'cognito' : 'firebase';
          const otherProvider = otherType === 'firebase' ? firebaseProvider : cognitoProvider;

          if (otherProvider) {
            try {
              authResponse = await otherProvider.signIn(email, password);
              usedProviderType = otherType;
              logger.info('Fallback provider authentication successful', {
                originalProvider: type,
                fallbackProvider: otherType,
                email
              });
            } catch (e2) {
              throw e; // Throw original error
            }
          } else {
            throw e;
          }
        } else {
          if (e.name === 'UserNotConfirmedException') {
            return errorResponse(403, 'Email not verified', requestId, { requiresVerification: true, email });
          }
          throw e;
        }
      }
    }

    const { user: authUser, tokens } = authResponse;

    // Database reconciliation and user creation/update
    let existingUser = null;

    // 1. Try finding by Auth Provider ID (Most reliable for Phone/Auth and Hybrid flows)
    if (authUser.id) {
      existingUser = await prisma.users.findFirst({
        where: { auth_provider_id: authUser.id }
      });
    }

    // 2. If not found, try finding by email
    if (!existingUser && authUser.email) {
      existingUser = await prisma.users.findFirst({ where: { email: authUser.email } });
    }

    let user;

    if (existingUser) {
      // Account lockout check
      const lockoutCheck = await securityService.checkAccountLockout(existingUser.id);
      if (!lockoutCheck.allowed) {
        return errorResponse(423, lockoutCheck.reason || 'Account locked', requestId, {
          retryAfter: lockoutCheck.retryAfter
        });
      }

      // Update user with current provider and login info
      const updateData: any = {
        last_login_at: new Date(),
        login_count: { increment: 1 }
      };

      // Update provider if it changed (migration scenario)
      if (existingUser.current_auth_provider !== usedProviderType) {
        updateData.current_auth_provider = usedProviderType;
        logger.info('User provider migration detected', {
          userId: existingUser.id.toString(),
          oldProvider: existingUser.current_auth_provider,
          newProvider: usedProviderType
        });
      }

      await prisma.users.update({
        where: { id: existingUser.id },
        data: updateData
      });

      // Ensure auth provider mapping exists
      const mapping = await prisma.auth_provider_mapping.findUnique({
        where: { provider_type_provider_uid: { provider_type: usedProviderType, provider_uid: authUser.id } }
      });

      if (!mapping) {
        await prisma.auth_provider_mapping.create({
          data: {
            user_id: existingUser.id,
            provider_type: usedProviderType,
            provider_uid: authUser.id,
            provider_email: authUser.email,
            is_primary: true
          }
        });
      }

      user = existingUser;
    } else {
      // Create new user (Just-In-Time provisioning)
      const signupInfo = getSignupSource(usedProviderType);

      user = await prisma.users.create({
        data: {
          auth_provider_id: authUser.id,
          email: authUser.email,
          first_name: authUser.firstName || 'User',
          last_name: authUser.lastName || 'User',
          role: authUser.role || 'client',
          account_status: 'active',
          is_verified: true,
          current_auth_provider: usedProviderType,
          email_verified: true,
          signup_source: signupInfo.source,
          signup_platform: signupInfo.platform,
          last_login_at: new Date(),
          login_count: 1
        }
      });

      // Create auth provider mapping
      await prisma.auth_provider_mapping.create({
        data: {
          user_id: user.id,
          provider_type: usedProviderType,
          provider_uid: authUser.id,
          provider_email: authUser.email,
          is_primary: true
        }
      });

      // Create client profile if user is a client
      if (user.role === 'client') {
        await prisma.clients.create({
          data: {
            user_id: user.id,
            status: 'active',
            has_insurance: false
          }
        });
      }

      logger.info('New user created via JIT provisioning', {
        userId: user.id.toString(),
        provider: usedProviderType,
        source: signupInfo.source,
        platform: signupInfo.platform
      });
    }

    // Check if MFA is required
    if (user.mfa_enabled && !mfaToken && mfaService) {
      if (user.role === 'therapist' || authConfig?.mfaRequired) {
        return successResponse({
          requiresMFA: true,
          mfaEnabled: true,
          userId: user.id.toString()
        }, 'MFA required', requestId);
      }
    }

    // Verify MFA if provided
    if (mfaToken && mfaService) {
      const mfaResult = await mfaService.verifyMFA(user.id, mfaToken);
      if (!mfaResult.success) {
        await securityService.recordFailedLogin(user.email, ipAddress, userAgent);
        return errorResponse(401, 'Invalid MFA token', requestId);
      }
    }

    // Record successful login
    await securityService.recordSuccessfulLogin(user.id, user.email, ipAddress, userAgent);

    // Detect suspicious activity
    const suspiciousActivities = await securityService.detectSuspiciousActivity(user.id, ipAddress, userAgent, 'login');
    if (suspiciousActivities.length > 0) {
      logger.warn('Suspicious login activity detected', {
        userId: user.id.toString(),
        activities: suspiciousActivities,
        ipAddress,
        userAgent
      });
    }

    // Create session if session service is available
    let sessionId: string | undefined;
    if (sessionService && deviceInfo) {
      try {
        // sessionId = await sessionService.createSession(
        //   user.id,
        //   {
        //     userAgent,
        //     ipAddress,
        //     deviceId: deviceInfo.deviceId,
        //     platform: deviceInfo.platform,
        //     browser: deviceInfo.browser,
        //     os: deviceInfo.os
        //   },
        //   userAgent,
        //   deviceInfo.rememberMe || false
        // );
        logger.info('Session creation skipped - method not implemented', { userId: user.id.toString() });
      } catch (error) {
        logger.error('Failed to create session', { userId: user.id.toString(), error });
      }
    }

    // Register device if security service is available
    if (securityService && deviceInfo) {
      try {
        const fingerprint = securityService.generateDeviceFingerprint(userAgent, ipAddress, deviceInfo);
        await securityService.createDeviceFingerprint(user.id, deviceInfo.deviceId, userAgent, ipAddress);
      } catch (error) {
        logger.error('Failed to register device', { userId: user.id.toString(), error });
      }
    }

    // Create compliance audit trail
    if (complianceService) {
      try {
        await complianceService.createAuditTrail({
          userId: user.id,
          action: 'user_login',
          resourceType: 'authentication',
          resourceId: user.id.toString(),
          newValues: {
            provider: usedProviderType,
            ipAddress,
            userAgent,
            sessionId,
            mfaUsed: !!mfaToken
          },
          ipAddress,
          userAgent,
          complianceLevel: 'medium'
        });
      } catch (error) {
        logger.error('Failed to create compliance audit trail', { userId: user.id.toString(), error });
      }
    }

    // RBAC
    const rbacService = new RBACService(prisma);
    const rbacData = await rbacService.getUserRBAC(user.id);

    monitor.end(true);
    return successResponse({
      user: {
        id: user.id.toString(),
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        account_status: user.account_status,
        currentProvider: usedProviderType,
        mfaEnabled: user.mfa_enabled,
        roles: rbacData.roles,
        permissions: rbacData.permissions
      },
      tokens,
      sessionId,
      suspiciousActivity: suspiciousActivities.length > 0
    }, 'Login successful', requestId);

  } catch (error: any) {
    logger.error('Login error', logContext, error);
    monitor.end(false);

    // Record failed login attempt if we have user info
    if (error.userId && securityService) {
      try {
        await securityService.recordFailedLogin(
          error.userId,
          event.requestContext.identity.sourceIp,
          event.headers['User-Agent'] || ''
        );
      } catch (e) {
        logger.error('Failed to record failed login', { error: e });
      }
    }

    return errorResponse(401, error.message || 'Authentication failed', requestId);
  }
}

async function handleRegister(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const prisma = getPrisma();

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password, firstName, lastName, phoneNumber, role = 'client' } = body;

    if (!email || !password) return validationErrorResponse('Email and password are required', requestId);

    // Register ALWAYS uses Primary Provider configured (Firebase for web, Cognito for mobile)
    const { provider, type } = await resolveProvider();

    let userId: string;
    try {
      userId = await provider.signUp(email, password, { firstName, lastName, role, phoneNumber });
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.name === 'UsernameExistsException') {
        return errorResponse(409, 'User already exists', requestId);
      }
      throw e;
    }

    // Get signup source based on provider type
    const signupInfo = getSignupSource(type);

    // Create user in database
    const user = await prisma.users.create({
      data: {
        auth_provider_id: userId,
        email,
        first_name: firstName || 'User',
        last_name: lastName || 'User',
        role,
        current_auth_provider: type,
        is_verified: false,
        email_verified: false,
        signup_source: signupInfo.source,
        signup_platform: signupInfo.platform,
        phone_number: phoneNumber,
        account_status: 'pending_verification'
      }
    });

    // Create auth provider mapping
    await prisma.auth_provider_mapping.create({
      data: {
        user_id: user.id,
        provider_type: type,
        provider_uid: userId,
        provider_email: email,
        is_primary: true
      }
    });

    // Create client profile if user is a client
    if (role === 'client') {
      await prisma.clients.create({
        data: {
          user_id: user.id,
          status: 'pending_verification',
          has_insurance: false
        }
      });
    }

    logger.info('User registration successful', {
      userId: user.id.toString(),
      email,
      provider: type,
      source: signupInfo.source,
      platform: signupInfo.platform,
      role
    });

    return successResponse({
      user: {
        id: user.id.toString(),
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isVerified: user.is_verified || false
      },
      requiresVerification: true,
      message: 'Registration successful. Please verify your email.',
      provider: type
    }, 'Registration completed', requestId);

  } catch (e: any) {
    logger.error('Registration error', logContext, e);
    return errorResponse(500, e.message || 'Registration failed', requestId);
  }
}

async function handleForgotPassword(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return errorResponse(400, 'Email required', requestId);

    // Use resolved provider to ensure we send reset for WHERE the user is
    const { provider } = await resolveProvider(email);

    await provider.forgotPassword(email);
    return successResponse({ message: 'Password reset link sent' }, 'Success', requestId);
  } catch (error: any) {
    logger.error('Forgot password error', logContext, error);
    return errorResponse(500, error.message || 'Password reset failed', requestId);
  }
}

async function handleResendConfirmationCode(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return errorResponse(400, 'Email required', requestId);

    const { provider } = await resolveProvider(email);
    await provider.resendConfirmationCode(email);
    return successResponse({ message: 'Confirmation code resent' }, 'Success', requestId);
  } catch (error: any) {
    logger.error('Resend confirmation code error', logContext, error);
    return errorResponse(500, error.message || 'Failed to resend code', requestId);
  }
}

async function handleConfirmNewPassword(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const { email, code, token, newPassword } = JSON.parse(event.body || '{}');
    if (!email || !newPassword || (!code && !token)) {
      return validationErrorResponse('Email, new password, and confirmation code/token required', requestId);
    }

    const { provider } = await resolveProvider(email);
    await provider.confirmForgotPassword(email, code || token, newPassword);
    return successResponse({ message: 'Password changed successfully' }, 'Success', requestId);
  } catch (error: any) {
    logger.error('Confirm new password error', logContext, error);
    return errorResponse(500, error.message || 'Password change failed', requestId);
  }
}

async function handleConfirmSignUp(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const { email, confirmationCode } = JSON.parse(event.body || '{}');
    if (!email || !confirmationCode) {
      return validationErrorResponse('Email and confirmation code required', requestId);
    }

    const { provider } = await resolveProvider(email);
    await provider.confirmSignUp(email, confirmationCode);

    // Update user verification status in database
    const prisma = getPrisma();
    await prisma.users.updateMany({
      where: { email },
      data: {
        is_verified: true,
        email_verified: true,
        account_status: 'active',
        verified_at: new Date()
      }
    });

    // Update client status if applicable
    const user = await prisma.users.findUnique({ where: { email } });
    if (user && user.role === 'client') {
      await prisma.clients.updateMany({
        where: { user_id: user.id },
        data: { status: 'active' }
      });
    }

    logger.info('User email verification completed', { email });
    return successResponse({ message: 'Email verified successfully' }, 'Success', requestId);
  } catch (error: any) {
    logger.error('Confirm signup error', logContext, error);
    return errorResponse(500, error.message || 'Email verification failed', requestId);
  }
}

async function handleRefreshToken(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const { refreshToken } = JSON.parse(event.body || '{}');
    if (!refreshToken) return validationErrorResponse('Refresh token required', requestId);

    // Try to determine provider from token structure or try both providers
    const primaryType = authConfig?.authProviderType || 'firebase';
    const primary = primaryType === 'firebase' ? firebaseProvider : cognitoProvider;
    const secondary = primaryType === 'firebase' ? cognitoProvider : firebaseProvider;

    let result: any = null;
    let usedProvider = '';

    // Try primary provider first
    if (primary) {
      try {
        result = await primary.refreshToken(refreshToken);
        usedProvider = primaryType;
      } catch (e) {
        logger.debug('Primary provider refresh failed', { provider: primaryType, error: (e as Error).message });
      }
    }

    // Try secondary provider if primary failed
    if (!result && secondary) {
      const secondaryType = primaryType === 'firebase' ? 'cognito' : 'firebase';
      try {
        result = await secondary.refreshToken(refreshToken);
        usedProvider = secondaryType;
      } catch (e) {
        logger.debug('Secondary provider refresh failed', { provider: secondaryType, error: (e as Error).message });
      }
    }

    if (!result) {
      return errorResponse(401, 'Invalid or expired refresh token', requestId);
    }

    logger.info('Token refresh successful', { provider: usedProvider });
    return successResponse({ tokens: result.tokens }, 'Token refreshed successfully', requestId);

  } catch (error: any) {
    logger.error('Refresh token error', logContext, error);
    return errorResponse(401, error.message || 'Token refresh failed', requestId);
  }
}

async function handleLogout(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { accessToken, userId } = body;

    if (!accessToken) {
      return validationErrorResponse('Access token required', requestId);
    }

    // Try to determine provider from token and sign out
    const detectedType = detectTokenProvider(accessToken);
    let signedOut = false;

    if (detectedType === 'firebase' && firebaseProvider) {
      try {
        await firebaseProvider.signOut(accessToken);
        signedOut = true;
      } catch (e) {
        logger.warn('Firebase signout failed', { error: (e as Error).message });
      }
    } else if (detectedType === 'cognito' && cognitoProvider) {
      try {
        await cognitoProvider.signOut(accessToken);
        signedOut = true;
      } catch (e) {
        logger.warn('Cognito signout failed', { error: (e as Error).message });
      }
    }

    // If token detection failed, try both providers
    if (!signedOut) {
      if (firebaseProvider) {
        try {
          await firebaseProvider.signOut(accessToken);
          signedOut = true;
        } catch (e) { /* Try next provider */ }
      }

      if (!signedOut && cognitoProvider) {
        try {
          await cognitoProvider.signOut(accessToken);
          signedOut = true;
        } catch (e) { /* Both failed */ }
      }
    }

    // Invalidate sessions if session service is available
    if (userId && sessionService) {
      try {
        await sessionService.invalidateAllUserSessions(BigInt(userId));
      } catch (error) {
        logger.error('Failed to invalidate user sessions', { userId, error });
      }
    }

    // Create compliance audit trail
    if (userId && complianceService) {
      try {
        await complianceService.createAuditTrail({
          userId: BigInt(userId),
          action: 'user_logout',
          resourceType: 'authentication',
          resourceId: userId,
          newValues: {
            signedOut: signedOut,
            timestamp: new Date().toISOString()
          },
          ipAddress: event.requestContext.identity.sourceIp,
          userAgent: event.headers['User-Agent'] || '',
          complianceLevel: 'low'
        });
      } catch (error) {
        logger.error('Failed to create logout audit trail', { userId, error });
      }
    }

    logger.info('User logout completed', { userId, signedOut });
    return successResponse({
      message: 'Logged out successfully',
      signedOut
    }, 'Logout completed', requestId);

  } catch (error: any) {
    logger.error('Logout error', logContext, error);
    return errorResponse(500, error.message || 'Logout failed', requestId);
  }
}

async function handleGetTherapistStatus(authId: string, reqId: string, log: any): Promise<APIGatewayProxyResult> {
  const prisma = getPrisma();
  // Same implementation as before
  const user = await prisma.users.findFirst({ where: { auth_provider_id: authId } });
  if (user) {
    return successResponse({ status: user.account_status, canLogin: user.account_status === 'active', isVerified: user.is_verified }, 'Status', reqId);
  }
  // @ts-ignore
  const reg = await prisma.temp_therapist_registrations?.findFirst({ where: { auth_provider_id: authId } });
  if (reg) {
    return successResponse({ status: reg.registration_status, canLogin: false }, 'Therapist Status', reqId);
  }
  return errorResponse(404, 'Not found', reqId);
}

// ============================================================================
// MFA Handlers
// ============================================================================

async function handleSetupTOTP(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, userEmail } = body;

    if (!userId || !userEmail) {
      return validationErrorResponse('User ID and email required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    const result = await mfaService.setupTOTP(BigInt(userId));

    return successResponse({
      secret: result.secret,
      qrCodeUrl: result.qrCode,
      backupCodes: result.backupCodes,
      manualEntryKey: result.secret
    }, 'TOTP setup initiated', requestId);

  } catch (error: any) {
    logger.error('TOTP setup error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleVerifyTOTP(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, token } = body;

    if (!userId || !token) {
      return validationErrorResponse('User ID and token required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    const verified = await mfaService.verifyAndEnableTOTP(BigInt(userId), token);

    return successResponse({
      verified,
      enabled: verified
    }, verified ? 'TOTP enabled successfully' : 'Invalid token', requestId);

  } catch (error: any) {
    logger.error('TOTP verification error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleSetupSMS(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, phoneNumber } = body;

    if (!userId || !phoneNumber) {
      return validationErrorResponse('User ID and phone number required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    await mfaService.setupSMS(BigInt(userId), phoneNumber);

    return successResponse({
      sent: true
    }, 'SMS verification code sent', requestId);

  } catch (error: any) {
    logger.error('SMS setup error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleVerifySMS(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, phoneNumber, code } = body;

    if (!userId || !phoneNumber || !code) {
      return validationErrorResponse('User ID, phone number, and code required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    const verified = await mfaService.verifyAndEnableSMS(BigInt(userId), code);

    return successResponse({
      verified,
      enabled: verified
    }, verified ? 'SMS MFA enabled successfully' : 'Invalid code', requestId);

  } catch (error: any) {
    logger.error('SMS verification error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleSendSMSCode(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId } = body;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    await mfaService.sendSMSCode(BigInt(userId));

    return successResponse({
      sent: true
    }, 'SMS code sent', requestId);

  } catch (error: any) {
    logger.error('Send SMS code error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleRegenerateBackupCodes(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId } = body;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    const backupCodes = await mfaService.regenerateBackupCodes(BigInt(userId));

    return successResponse({
      backupCodes
    }, 'Backup codes regenerated', requestId);

  } catch (error: any) {
    logger.error('Regenerate backup codes error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleDisableMFA(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, verificationToken } = body;

    if (!userId || !verificationToken) {
      return validationErrorResponse('User ID and verification token required', requestId);
    }

    if (!mfaService) {
      return errorResponse(500, 'MFA service not available', requestId);
    }

    await mfaService.disableMFA(BigInt(userId));

    return successResponse({
      disabled: true
    }, 'MFA disabled successfully', requestId);

  } catch (error: any) {
    logger.error('Disable MFA error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleGetMFAStatus(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    const prisma = getPrisma();
    const user = await prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { mfa_enabled: true }
    });

    if (!user) {
      return errorResponse(404, 'User not found', requestId);
    }

    const mfaSettings = await (prisma as any).user_mfa_settings.findUnique({
      where: { user_id: BigInt(userId) },
      select: {
        is_totp_enabled: true,
        is_sms_enabled: true,
        sms_phone_number: true,
        backup_codes: true
      }
    });

    return successResponse({
      mfaEnabled: user.mfa_enabled,
      totpEnabled: mfaSettings?.is_totp_enabled || false,
      smsEnabled: mfaSettings?.is_sms_enabled || false,
      smsPhoneNumber: mfaSettings?.sms_phone_number || null,
      backupCodesCount: mfaSettings?.backup_codes?.length || 0
    }, 'MFA status retrieved', requestId);

  } catch (error: any) {
    logger.error('Get MFA status error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

// ============================================================================
// Session Management Handlers
// ============================================================================

async function handleGetActiveSessions(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.queryStringParameters?.userId;
    const currentSessionId = event.queryStringParameters?.currentSessionId;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!sessionService) {
      return errorResponse(500, 'Session service not available', requestId);
    }

    const sessions = await sessionService.getUserActiveSessions(BigInt(userId), currentSessionId || undefined);

    return successResponse({
      sessions
    }, 'Active sessions retrieved', requestId);

  } catch (error: any) {
    logger.error('Get active sessions error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleGetSessionAnalytics(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.queryStringParameters?.userId;
    const days = parseInt(event.queryStringParameters?.days || '30');

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!sessionService) {
      return errorResponse(500, 'Session service not available', requestId);
    }

    const analytics = await sessionService.getSessionAnalytics(BigInt(userId), days);

    return successResponse({
      analytics
    }, 'Session analytics retrieved', requestId);

  } catch (error: any) {
    logger.error('Get session analytics error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleInvalidateAllSessions(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, excludeSessionId } = body;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!sessionService) {
      return errorResponse(500, 'Session service not available', requestId);
    }

    const invalidatedCount = await sessionService.invalidateAllUserSessions(BigInt(userId), excludeSessionId);

    return successResponse({
      invalidatedCount
    }, 'All sessions invalidated', requestId);

  } catch (error: any) {
    logger.error('Invalidate all sessions error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleTrustDevice(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, deviceHash } = body;

    if (!userId || !deviceHash) {
      return validationErrorResponse('User ID and device hash required', requestId);
    }

    if (!securityService) {
      return errorResponse(500, 'Security service not available', requestId);
    }

    await securityService.trustDevice(BigInt(userId), deviceHash);

    return successResponse({
      trusted: true
    }, 'Device trusted successfully', requestId);

  } catch (error: any) {
    logger.error('Trust device error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

// ============================================================================
// Compliance Handlers
// ============================================================================

async function handleRecordConsent(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, consentType, granted, version, details } = body;
    const ipAddress = event.requestContext.identity.sourceIp;

    if (!userId || !consentType || granted === undefined || !version) {
      return validationErrorResponse('User ID, consent type, granted status, and version required', requestId);
    }

    if (!complianceService) {
      return errorResponse(500, 'Compliance service not available', requestId);
    }

    await complianceService.recordConsent({
      userId: BigInt(userId),
      consentType,
      granted,
      version,
      timestamp: granted ? new Date() : new Date(),
      ipAddress,
      userAgent: event.headers['User-Agent'] || ''
    });

    return successResponse({
      recorded: true
    }, 'Consent recorded successfully', requestId);

  } catch (error: any) {
    logger.error('Record consent error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleGetUserConsents(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return validationErrorResponse('User ID required', requestId);
    }

    if (!complianceService) {
      return errorResponse(500, 'Compliance service not available', requestId);
    }

    const consents = await complianceService.getUserConsents(BigInt(userId));

    return successResponse({
      consents
    }, 'User consents retrieved', requestId);

  } catch (error: any) {
    logger.error('Get user consents error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleGetAuditTrail(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.queryStringParameters?.userId;
    const action = event.queryStringParameters?.action;
    const resourceType = event.queryStringParameters?.resourceType;
    const complianceLevel = event.queryStringParameters?.complianceLevel;
    const startDate = event.queryStringParameters?.startDate ? new Date(event.queryStringParameters.startDate) : undefined;
    const endDate = event.queryStringParameters?.endDate ? new Date(event.queryStringParameters.endDate) : undefined;
    const limit = parseInt(event.queryStringParameters?.limit || '100');
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    if (!complianceService) {
      return errorResponse(500, 'Compliance service not available', requestId);
    }

    const auditTrails = await complianceService.searchAuditTrails({
      userId: userId ? BigInt(userId) : undefined,
      action,
      resourceType,
      complianceLevel,
      startDate,
      endDate,
      limit,
      offset
    });

    return successResponse({
      auditTrails,
      count: auditTrails.length
    }, 'Audit trail retrieved', requestId);

  } catch (error: any) {
    logger.error('Get audit trail error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

async function handleDataExportRequest(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, requestedBy, reason } = body;

    if (!userId || !requestedBy || !reason) {
      return validationErrorResponse('User ID, requested by, and reason required', requestId);
    }

    if (!complianceService) {
      return errorResponse(500, 'Compliance service not available', requestId);
    }

    const requestId_export = await complianceService.handleDataExportRequest(
      BigInt(userId),
      BigInt(requestedBy),
      reason
    );

    return successResponse({
      requestId: requestId_export
    }, 'Data export request created', requestId);

  } catch (error: any) {
    logger.error('Data export request error', logContext, error);
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Handle check duplicate email/phone endpoint
 */
async function handleCheckDuplicate(event: APIGatewayProxyEvent, requestId: string, logContext: any): Promise<APIGatewayProxyResult> {
  const prisma = getPrisma();

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, phoneNumber } = body;

    if (!email && !phoneNumber) {
      return validationErrorResponse('Email or phone number is required', requestId);
    }

    // Check for existing users
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phone_number: phoneNumber }] : [])
        ]
      },
      select: {
        id: true,
        email: true,
        phone_number: true
      }
    });

    if (existingUser) {
      // User exists - return 409 with details
      return {
        statusCode: 409,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          emailExists: email && existingUser.email === email,
          phoneExists: phoneNumber && existingUser.phone_number === phoneNumber,
          message: 'User already exists'
        })
      };
    }

    // User doesn't exist - return 200 (available)
    return successResponse({
      emailExists: false,
      phoneExists: false,
      message: 'Email and phone are available'
    }, 'Available', requestId);

  } catch (error: any) {
    logger.error('Check duplicate error', logContext, error);
    return errorResponse(500, 'Failed to check duplicate', requestId);
  }
}