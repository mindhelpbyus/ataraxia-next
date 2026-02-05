/**
 * Base Authentication Provider Interface
 * 
 * Defines the contract that all authentication providers must implement
 * for seamless provider switching between Firebase and Cognito
 */

export interface AuthResult {
  success: boolean;
  user?: {
    uid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    emailVerified?: boolean;
  };
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresAt: number;
  };
  error?: string;
  needsVerification?: boolean;
  mfaRequired?: boolean;
  mfaSession?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
  mfaSession?: string;
}

export interface MFASetupResult {
  success: boolean;
  secret?: string;
  qrCode?: string;
  backupCodes?: string[];
  error?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  email: string;
  code: string;
  newPassword: string;
}

export abstract class AuthProvider {
  protected providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Register a new user
   */
  abstract register(request: RegisterRequest): Promise<AuthResult>;

  /**
   * Login with email and password
   */
  abstract login(request: LoginRequest): Promise<AuthResult>;

  /**
   * Verify email address
   */
  abstract verifyEmail(token: string): Promise<AuthResult>;

  /**
   * Resend email verification
   */
  abstract resendEmailVerification(email: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Request password reset
   */
  abstract requestPasswordReset(request: PasswordResetRequest): Promise<{ success: boolean; error?: string }>;

  /**
   * Confirm password reset
   */
  abstract confirmPasswordReset(request: PasswordResetConfirmRequest): Promise<AuthResult>;

  /**
   * Setup MFA/2FA
   */
  abstract setupMFA(userId: string): Promise<MFASetupResult>;

  /**
   * Verify MFA code
   */
  abstract verifyMFA(userId: string, code: string, session?: string): Promise<AuthResult>;

  /**
   * Disable MFA
   */
  abstract disableMFA(userId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Refresh authentication tokens
   */
  abstract refreshTokens(refreshToken: string): Promise<AuthResult>;

  /**
   * Validate token
   */
  abstract validateToken(token: string): Promise<AuthResult>;

  /**
   * Sign out user
   */
  abstract signOut(token: string): Promise<{ success: boolean; error?: string }>;

  // Legacy method names for backward compatibility with auth handler
  async signUp(email: string, password: string, options?: { firstName?: string; lastName?: string; role?: string; phoneNumber?: string }): Promise<string> {
    const request: RegisterRequest = {
      email,
      password,
      firstName: options?.firstName || '',
      lastName: options?.lastName || '',
      phoneNumber: options?.phoneNumber,
      role: options?.role
    };
    
    const result = await this.register(request);
    if (result.success && result.user) {
      return result.user.uid;
    }
    throw new Error(result.error || 'Registration failed');
  }

  async signIn(email: string, password: string): Promise<{ user: any; tokens: any }> {
    const request: LoginRequest = { email, password };
    const result = await this.login(request);
    
    if (result.success && result.user && result.tokens) {
      return {
        user: {
          id: result.user.uid,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: 'client' // Default role
        },
        tokens: result.tokens
      };
    }
    
    throw new Error(result.error || 'Login failed');
  }

  async verifyToken(token: string): Promise<any> {
    const result = await this.validateToken(token);
    if (result.success && result.user) {
      return {
        id: result.user.uid,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: 'client' // Default role
      };
    }
    throw new Error(result.error || 'Token validation failed');
  }

  async forgotPassword(email: string): Promise<void> {
    const result = await this.requestPasswordReset({ email });
    if (!result.success) {
      throw new Error(result.error || 'Password reset request failed');
    }
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    const result = await this.confirmPasswordReset({ email, code, newPassword });
    if (!result.success) {
      throw new Error(result.error || 'Password reset confirmation failed');
    }
  }

  async confirmSignUp(email: string, confirmationCode: string): Promise<void> {
    const result = await this.verifyEmail(confirmationCode);
    if (!result.success) {
      throw new Error(result.error || 'Email verification failed');
    }
  }

  async resendConfirmationCode(email: string): Promise<void> {
    const result = await this.resendEmailVerification(email);
    if (!result.success) {
      throw new Error(result.error || 'Failed to resend confirmation code');
    }
  }

  async refreshToken(refreshToken: string): Promise<{ tokens: any }> {
    const result = await this.refreshTokens(refreshToken);
    if (result.success && result.tokens) {
      return { tokens: result.tokens };
    }
    throw new Error(result.error || 'Token refresh failed');
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Check if provider is available/configured
   */
  abstract isAvailable(): boolean;

  /**
   * Get provider health status
   */
  abstract getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
    error?: string;
  }>;
}