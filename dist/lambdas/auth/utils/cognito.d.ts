export interface CognitoUser {
    sub: string;
    email: string;
    email_verified: boolean;
    phone_number?: string;
    phone_number_verified?: boolean;
    given_name?: string;
    family_name?: string;
    'custom:role'?: string;
    'custom:license_number'?: string;
    'custom:verification_status'?: string;
}
/**
 * Register new user with Cognito
 * Perfect for therapy app - professional email registration
 */
export declare function registerUser(email: string, password: string, firstName: string, lastName: string, role?: string, phoneNumber?: string): Promise<{
    userSub: string;
    needsVerification: boolean;
}>;
/**
 * Authenticate user with Cognito
 * Returns JWT tokens for session management
 */
export declare function authenticateUser(email: string, password: string): Promise<{
    accessToken: string;
    idToken: string;
    refreshToken: string;
    user: CognitoUser;
}>;
/**
 * Verify Cognito JWT token
 * Replaces Firebase token verification
 * Use ID token for user info, access token for API access
 */
export declare function verifyCognitoToken(token: string, tokenType?: 'access' | 'id'): Promise<CognitoUser>;
/**
 * Confirm user email verification
 * Required after registration
 */
export declare function confirmSignUp(email: string, confirmationCode: string): Promise<void>;
/**
 * Resend email verification code
 */
export declare function resendConfirmationCode(email: string): Promise<void>;
/**
 * Initiate password reset
 * Sends reset code to user's email
 */
export declare function forgotPassword(email: string): Promise<void>;
/**
 * Confirm password reset with code
 */
export declare function confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<void>;
/**
 * Admin function: Create therapist user with verification
 * Used when admin approves therapist registration
 */
export declare function createTherapistUser(email: string, firstName: string, lastName: string, licenseNumber: string, tempPassword: string): Promise<string>;
/**
 * Update user attributes (for profile updates)
 */
export declare function updateUserAttributes(email: string, attributes: Record<string, string>): Promise<void>;
/**
 * Get user by email (admin function)
 */
export declare function getUser(email: string): Promise<CognitoUser | null>;
//# sourceMappingURL=cognito.d.ts.map