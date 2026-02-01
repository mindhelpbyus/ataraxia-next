"use strict";
/**
 * Auth Lambda Handler - Hybrid Support (Firebase + Cognito)
 *
 * Handles authentication supporting both Firebase and Cognito providers simultaneously.
 * Uses DB lookup to route requests to the correct provider for existing users.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const prisma_1 = require("../../lib/prisma");
const CognitoProvider_1 = require("../../lib/auth/providers/CognitoProvider");
const FirebaseProvider_1 = require("../../lib/auth/providers/FirebaseProvider");
const RBACService_1 = require("../../lib/auth/RBACService");
const configManager_1 = require("../../lib/configManager");
const logger_1 = require("../../shared/logger");
const response_1 = require("../../shared/response");
const logger = (0, logger_1.createLogger)('auth-service');
// Global variables for auth providers
let firebaseProvider;
let cognitoProvider;
let authConfig = null;
async function initializeAuthProviders() {
    if (authConfig && (firebaseProvider || cognitoProvider)) {
        return;
    }
    const prisma = (0, prisma_1.getPrisma)();
    const configManager = (0, configManager_1.getConfigManager)(prisma);
    try {
        authConfig = await configManager.getAuthConfig();
    }
    catch (error) {
        logger.warn('Config load failed, using fallbacks', { error: error.message });
        // Fallback config
        authConfig = {
            authProviderType: process.env.AUTH_PROVIDER_TYPE || 'firebase',
            authProviderDefault: process.env.AUTH_PROVIDER_TYPE || 'firebase',
            enableUniversalAuth: true,
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
            jwtSecret: 'fallback',
            sessionTimeoutMinutes: 30,
            refreshTokenExpiryDays: 7,
            mfaRequired: false,
            passwordMinLength: 12,
            passwordRotationDays: 90,
            apiBaseUrl: '',
            apiTimeout: 30000,
            enableDetailedErrors: true
        };
    }
    // Initialize Firebase
    if (authConfig.firebaseProjectId) {
        try {
            firebaseProvider = new FirebaseProvider_1.FirebaseProvider(authConfig.firebaseProjectId, authConfig.firebaseClientEmail, authConfig.firebasePrivateKey, authConfig.firebaseApiKey);
        }
        catch (e) {
            logger.error('Failed to initialize Firebase Provider', { error: e });
        }
    }
    // Initialize Cognito
    if (authConfig.cognitoUserPoolId && authConfig.cognitoClientId) {
        try {
            cognitoProvider = new CognitoProvider_1.CognitoProvider(authConfig.cognitoRegion || 'us-west-2', authConfig.cognitoUserPoolId, authConfig.cognitoClientId);
        }
        catch (e) {
            logger.error('Failed to initialize Cognito Provider', { error: e });
        }
    }
}
/**
 * Resolves the correct provider for a user context.
 * 1. If email is provided, check DB usage.
 * 2. If valid provider found, return it.
 * 3. Fallback to Primary Provider.
 */
async function resolveProvider(email) {
    const primaryType = authConfig?.authProviderType || 'firebase';
    const primary = primaryType === 'firebase' ? firebaseProvider : cognitoProvider;
    // Safety check if primary failed to load
    const fallback = firebaseProvider || cognitoProvider;
    if (!fallback)
        throw new Error('No authentication providers are available');
    // Default to primary or fallback
    let selectedProvider = primary || fallback;
    let selectedType = primary ? primaryType : (firebaseProvider ? 'firebase' : 'cognito');
    if (email) {
        const prisma = (0, prisma_1.getPrisma)();
        const user = await prisma.users.findUnique({ where: { email }, select: { current_auth_provider: true } });
        if (user && user.current_auth_provider) {
            if (user.current_auth_provider === 'firebase' && firebaseProvider) {
                return { provider: firebaseProvider, type: 'firebase' };
            }
            if (user.current_auth_provider === 'cognito' && cognitoProvider) {
                return { provider: cognitoProvider, type: 'cognito' };
            }
            // If mapped provider not available, stick to default (migration case?)
        }
    }
    return { provider: selectedProvider, type: selectedType };
}
const handler = async (event) => {
    const requestId = event.requestContext.requestId;
    const path = event.path;
    const method = event.httpMethod;
    const logContext = { requestId, path, method };
    try {
        await initializeAuthProviders();
        if (method === 'OPTIONS') {
            return (0, response_1.successResponse)({}, 'CORS preflight', requestId);
        }
        if (method === 'POST') {
            if (path.includes('/auth/login') || path.includes('/auth/firebase-login')) {
                return await handleLogin(event, requestId, logContext);
            }
            if (path.includes('/auth/register')) {
                return await handleRegister(event, requestId, logContext);
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
                return await handleRefreshToken(event, requestId, logContext);
            }
            if (path.includes('/auth/logout')) {
                return await handleLogout(event, requestId, logContext);
            }
        }
        // ... GET handlers same as before ... 
        if (method === 'GET') {
            if (path.match(/\/auth\/therapist\/status\/[\w-]+$/)) {
                const authId = path.split('/').pop();
                return await handleGetTherapistStatus(authId, requestId, logContext);
            }
        }
        return (0, response_1.errorResponse)(404, `Route not found: ${method} ${path}`, requestId);
    }
    catch (error) {
        logger.error('Auth Lambda Error', logContext, error);
        return (0, response_1.errorResponse)(500, 'Internal server error', requestId);
    }
};
exports.handler = handler;
async function handleLogin(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'login', logContext);
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { email, password, idToken } = body;
        let authResponse;
        let usedProviderType = 'firebase';
        // Strategy:
        // 1. If idToken: Try verifying with Primary, then Secondary.
        // 2. If password: Try Resolving Provider (DB lookup). If fail/not found, Try Primary. If Primary UserNotFound, Try Secondary.
        if (idToken) {
            // Token Flow
            if (firebaseProvider) {
                try {
                    const user = await firebaseProvider.verifyToken(idToken);
                    authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
                    usedProviderType = 'firebase';
                }
                catch (e) { /* Check next */ }
            }
            if (!authResponse && cognitoProvider) {
                try {
                    const user = await cognitoProvider.verifyToken(idToken);
                    authResponse = { user, tokens: { accessToken: idToken, idToken, refreshToken: '', expiresIn: 3600 } };
                    usedProviderType = 'cognito';
                }
                catch (e) { /* Both failed */ }
            }
            if (!authResponse)
                return (0, response_1.errorResponse)(401, 'Invalid token', requestId);
        }
        else {
            // Password Flow
            if (!email || !password)
                return (0, response_1.validationErrorResponse)('Email and password required', requestId);
            // 1. Resolve Provider
            const { provider, type } = await resolveProvider(email);
            try {
                authResponse = await provider.signIn(email, password);
                usedProviderType = type;
            }
            catch (e) {
                // 2. Fallback logic: If we tried Type A and failed with 'Not Found', and we have Type B, try Type B.
                // But only if we are Universal Auth enabled AND we haven't already definitively determined the provider via DB.
                const isUserNotFound = e.message?.includes('not found') || e.code === 'UserNotFoundException' || e.code === 'auth/user-not-found';
                if (isUserNotFound && authConfig?.enableUniversalAuth) {
                    const otherType = type === 'firebase' ? 'cognito' : 'firebase';
                    const otherProvider = otherType === 'firebase' ? firebaseProvider : cognitoProvider;
                    if (otherProvider) {
                        try {
                            authResponse = await otherProvider.signIn(email, password);
                            usedProviderType = otherType;
                        }
                        catch (e2) {
                            throw e; // Throw original error (or e2?) - throw original usually.
                        }
                    }
                    else {
                        throw e;
                    }
                }
                else {
                    if (e.name === 'UserNotConfirmedException') {
                        return (0, response_1.errorResponse)(403, 'Email not verified', requestId, { requiresVerification: true, email });
                    }
                    throw e;
                }
            }
        }
        const { user: authUser, tokens } = authResponse;
        // Reconciliation / Migration Logic
        const existingUser = await prisma.users.findFirst({ where: { email: authUser.email } });
        let user;
        if (existingUser) {
            // Update user
            if (existingUser.current_auth_provider !== usedProviderType) {
                // Update provider if changed (Migration)
                await prisma.users.update({
                    where: { id: existingUser.id },
                    data: { current_auth_provider: usedProviderType, last_login_at: new Date(), login_count: { increment: 1 } }
                });
            }
            else {
                await prisma.users.update({
                    where: { id: existingUser.id },
                    data: { last_login_at: new Date(), login_count: { increment: 1 } }
                });
            }
            // Ensure mapping exists
            const mapping = await prisma.auth_provider_mapping.findUnique({
                where: { provider_type_provider_uid: { provider_type: usedProviderType, provider_uid: authUser.id } }
            });
            if (!mapping) {
                await prisma.auth_provider_mapping.create({
                    data: { user_id: existingUser.id, provider_type: usedProviderType, provider_uid: authUser.id, provider_email: authUser.email, is_primary: true }
                });
            }
            user = existingUser;
        }
        else {
            // Create new user (JIT)
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
                    last_login_at: new Date(),
                    login_count: 1
                }
            });
            await prisma.auth_provider_mapping.create({
                data: { user_id: user.id, provider_type: usedProviderType, provider_uid: authUser.id, provider_email: authUser.email, is_primary: true }
            });
            if (user.role === 'client') {
                await prisma.clients.create({ data: { user_id: user.id, status: 'active', has_insurance: false } });
            }
        }
        // RBAC
        const rbacService = new RBACService_1.RBACService(prisma);
        const rbacData = await rbacService.getUserRBAC(user.id);
        monitor.end(true);
        return (0, response_1.successResponse)({
            user: {
                id: user.id.toString(),
                email: user.email,
                name: `${user.first_name} ${user.last_name}`,
                role: user.role,
                account_status: user.account_status,
                currentProvider: usedProviderType,
                roles: rbacData.roles,
                permissions: rbacData.permissions
            },
            tokens
        }, 'Login successful', requestId);
    }
    catch (error) {
        logger.error('Login error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(401, error.message || 'Authentication failed', requestId);
    }
}
async function handleRegister(event, requestId, logContext) {
    const prisma = (0, prisma_1.getPrisma)();
    // Register ALWAYS uses Primary Provider configured
    const { provider, type } = await resolveProvider();
    try {
        // ... same logic as before but using resolved provider ...
        const body = JSON.parse(event.body || '{}');
        const { email, password, firstName, lastName, phoneNumber, role = 'client' } = body;
        if (!email || !password)
            return (0, response_1.validationErrorResponse)('Missing fields', requestId);
        let userId;
        try {
            userId = await provider.signUp(email, password, { firstName, lastName, role, phoneNumber });
        }
        catch (e) {
            if (e.message?.includes('already exists') || e.name === 'UsernameExistsException') {
                return (0, response_1.errorResponse)(409, 'User already exists', requestId);
            }
            throw e;
        }
        // Create user in DB
        const user = await prisma.users.create({
            data: {
                auth_provider_id: userId,
                email,
                first_name: firstName,
                last_name: lastName,
                role,
                current_auth_provider: type,
                is_verified: false
                // ... other fields
            }
        });
        // ... client creation ...
        if (role === 'client') {
            await prisma.clients.create({ data: { user_id: user.id, status: 'active', has_insurance: false } });
        }
        return (0, response_1.successResponse)({ userId: user.id.toString(), message: 'Registered' }, 'Success', requestId);
    }
    catch (e) {
        return (0, response_1.errorResponse)(500, e.message, requestId);
    }
}
async function handleForgotPassword(event, requestId, logContext) {
    const { email } = JSON.parse(event.body || '{}');
    if (!email)
        return (0, response_1.errorResponse)(400, 'Email required', requestId);
    // Use resolved provider to ensure we send reset for WHERE the user is
    const { provider } = await resolveProvider(email);
    await provider.forgotPassword(email);
    return (0, response_1.successResponse)({ message: 'Reset link sent' }, 'Success', requestId);
}
// ... helper wrappers for others using resolveProvider ...
async function handleResendConfirmationCode(event, requestId, logContext) {
    const { email } = JSON.parse(event.body || '{}');
    const { provider } = await resolveProvider(email);
    await provider.resendConfirmationCode(email);
    return (0, response_1.successResponse)({ message: 'Code resent' }, 'Success', requestId);
}
async function handleConfirmNewPassword(event, requestId, logContext) {
    const { email, code, token, newPassword } = JSON.parse(event.body || '{}');
    const { provider } = await resolveProvider(email);
    await provider.confirmForgotPassword(email, code || token, newPassword);
    return (0, response_1.successResponse)({ message: 'Password changed' }, 'Success', requestId);
}
async function handleConfirmSignUp(event, requestId, logContext) {
    const { email, confirmationCode } = JSON.parse(event.body || '{}');
    const { provider } = await resolveProvider(email);
    await provider.confirmSignUp(email, confirmationCode);
    const prisma = (0, prisma_1.getPrisma)();
    await prisma.users.updateMany({ where: { email }, data: { is_verified: true, account_status: 'active' } });
    return (0, response_1.successResponse)({ message: 'Confirmed' }, 'Success', requestId);
}
async function handleRefreshToken(event, requestId, logContext) {
    const { refreshToken } = JSON.parse(event.body || '{}');
    // We don't have email here.
    // Try Primary -> if fail try Secondary. 
    // Or check if refreshToken JWT tells us something? (Cognito is opaque string effectively, Firebase is opaque).
    // Just try Primary then Secondary.
    const primaryType = authConfig?.authProviderType || 'firebase';
    const primary = primaryType === 'firebase' ? firebaseProvider : cognitoProvider;
    const secondary = primaryType === 'firebase' ? cognitoProvider : firebaseProvider;
    try {
        if (primary) {
            const res = await primary.refreshToken(refreshToken);
            return (0, response_1.successResponse)({ tokens: res.tokens }, 'Refreshed', requestId);
        }
    }
    catch (e) { /* ignore */ }
    if (secondary) {
        try {
            const res = await secondary.refreshToken(refreshToken);
            return (0, response_1.successResponse)({ tokens: res.tokens }, 'Refreshed', requestId);
        }
        catch (e) { /* ignore */ }
    }
    return (0, response_1.errorResponse)(401, 'Invalid refresh token', requestId);
}
async function handleLogout(event, requestId, logContext) {
    return (0, response_1.successResponse)({ message: 'Logged out' }, 'Success', requestId);
}
async function handleGetTherapistStatus(authId, reqId, log) {
    const prisma = (0, prisma_1.getPrisma)();
    // Same implementation as before
    const user = await prisma.users.findFirst({ where: { auth_provider_id: authId } });
    if (user) {
        return (0, response_1.successResponse)({ status: user.account_status, canLogin: user.account_status === 'active', isVerified: user.is_verified }, 'Status', reqId);
    }
    // @ts-ignore
    const reg = await prisma.temp_therapist_registrations?.findFirst({ where: { auth_provider_id: authId } });
    if (reg) {
        return (0, response_1.successResponse)({ status: reg.registration_status, canLogin: false }, 'Therapist Status', reqId);
    }
    return (0, response_1.errorResponse)(404, 'Not found', reqId);
}
//# sourceMappingURL=handler.js.map