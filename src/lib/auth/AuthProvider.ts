
export interface AuthUser {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    emailVerified: boolean;
    phoneNumber?: string;
    metadata?: Record<string, any>;
}

export interface AuthToken {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface AuthResponse {
    user: AuthUser;
    tokens: AuthToken;
}

export interface AuthProvider {
    /**
     * Register a new user
     */
    signUp(
        email: string,
        password: string,
        attributes: {
            firstName: string;
            lastName: string;
            role: string;
            phoneNumber?: string;
            countryCode?: string;
        }
    ): Promise<string>; // Returns User ID (sub)

    /**
     * Authenticate a user
     */
    signIn(email: string, password: string): Promise<AuthResponse>;

    /**
     * Confirm user registration with code
     */
    confirmSignUp(email: string, code: string): Promise<boolean>;

    /**
     * Resend confirmation code
     */
    resendConfirmationCode(email: string): Promise<boolean>;

    /**
     * Initiate password reset
     */
    forgotPassword(email: string): Promise<boolean>;

    /**
     * Complete password reset
     */
    confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean>;

    /**
     * Verify a token and return the user ID (sub)
     */
    verifyToken(token: string): Promise<AuthUser>;

    /**
     * Refresh access token
     */
    refreshToken(refreshToken: string): Promise<AuthResponse>;
}
