/**
 * AWS Cognito Authentication Provider
 * 
 * Implements the AuthProvider interface for AWS Cognito User Pools
 * with full MFA, password reset, and token management support
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  RespondToAuthChallengeCommand,
  GlobalSignOutCommand,
  AuthFlowType,
  ChallengeNameType
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthProvider, AuthResult, RegisterRequest, LoginRequest, MFASetupResult, PasswordResetRequest, PasswordResetConfirmRequest } from '../AuthProvider';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('cognito-provider');

export class CognitoProvider extends AuthProvider {
  private client: CognitoIdentityProviderClient;
  private jwtVerifier: CognitoJwtVerifier<any, any, any>;
  private userPoolId: string;
  private clientId: string;
  private region: string;

  constructor(region: string, userPoolId: string, clientId: string) {
    super('cognito');
    this.region = region;
    this.userPoolId = userPoolId;
    this.clientId = clientId;

    this.client = new CognitoIdentityProviderClient({ region });
    this.jwtVerifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId
    });
  }

  async register(request: RegisterRequest): Promise<AuthResult> {
    try {
      logger.info('Registering user with Cognito', { email: request.email });

      const command = new SignUpCommand({
        ClientId: this.clientId,
        Username: request.email,
        Password: request.password,
        UserAttributes: [
          { Name: 'email', Value: request.email },
          { Name: 'given_name', Value: request.firstName },
          { Name: 'family_name', Value: request.lastName },
          { Name: 'custom:role', Value: request.role || 'client' }
        ]
      });

      const response = await this.client.send(command);

      return {
        success: true,
        user: {
          uid: response.UserSub!,
          email: request.email,
          firstName: request.firstName,
          lastName: request.lastName,
          emailVerified: false
        },
        needsVerification: !response.UserConfirmed
      };

    } catch (error: any) {
      logger.error('Cognito registration failed', { error: error.message, email: request.email });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async login(request: LoginRequest): Promise<AuthResult> {
    try {
      logger.info('Logging in user with Cognito', { email: request.email });

      const command = new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: request.email,
          PASSWORD: request.password
        }
      });

      const response = await this.client.send(command);

      // Handle MFA challenge
      if (response.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA) {
        if (!request.mfaCode) {
          return {
            success: false,
            mfaRequired: true,
            mfaSession: response.Session,
            error: 'MFA code required'
          };
        }

        // Respond to MFA challenge
        const mfaCommand = new RespondToAuthChallengeCommand({
          ClientId: this.clientId,
          ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
          Session: request.mfaSession || response.Session,
          ChallengeResponses: {
            SOFTWARE_TOKEN_MFA_CODE: request.mfaCode,
            USERNAME: request.email
          }
        });

        const mfaResponse = await this.client.send(mfaCommand);
        
        if (!mfaResponse.AuthenticationResult) {
          return {
            success: false,
            error: 'Invalid MFA code'
          };
        }

        response.AuthenticationResult = mfaResponse.AuthenticationResult;
      }

      if (!response.AuthenticationResult) {
        return {
          success: false,
          error: 'Authentication failed'
        };
      }

      // Verify and decode the ID token
      const idToken = response.AuthenticationResult.IdToken!;
      const payload = await this.jwtVerifier.verify(idToken);

      return {
        success: true,
        user: {
          uid: payload.sub,
          email: payload.email as string,
          firstName: payload.given_name as string,
          lastName: payload.family_name as string,
          emailVerified: payload.email_verified as boolean
        },
        tokens: {
          accessToken: response.AuthenticationResult.AccessToken!,
          idToken: response.AuthenticationResult.IdToken!,
          refreshToken: response.AuthenticationResult.RefreshToken,
          expiresAt: Date.now() + (response.AuthenticationResult.ExpiresIn! * 1000)
        }
      };

    } catch (error: any) {
      logger.error('Cognito login failed', { error: error.message, email: request.email });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async verifyEmail(code: string, email?: string): Promise<AuthResult> {
    try {
      if (!email) {
        return {
          success: false,
          error: 'Email is required for verification'
        };
      }

      const command = new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code
      });

      await this.client.send(command);

      return {
        success: true,
        user: {
          uid: '',
          email: email,
          emailVerified: true
        }
      };

    } catch (error: any) {
      logger.error('Cognito email verification failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async resendEmailVerification(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: this.clientId,
        Username: email
      });

      await this.client.send(command);

      return { success: true };

    } catch (error: any) {
      logger.error('Cognito resend verification failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async requestPasswordReset(request: PasswordResetRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const command = new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: request.email
      });

      await this.client.send(command);

      return { success: true };

    } catch (error: any) {
      logger.error('Cognito password reset request failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async confirmPasswordReset(request: PasswordResetConfirmRequest): Promise<AuthResult> {
    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: request.email,
        ConfirmationCode: request.code,
        Password: request.newPassword
      });

      await this.client.send(command);

      return {
        success: true,
        user: {
          uid: '',
          email: request.email
        }
      };

    } catch (error: any) {
      logger.error('Cognito password reset confirmation failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async setupMFA(accessToken: string): Promise<MFASetupResult> {
    try {
      const command = new AssociateSoftwareTokenCommand({
        AccessToken: accessToken
      });

      const response = await this.client.send(command);

      return {
        success: true,
        secret: response.SecretCode,
        // QR code would be generated on frontend
        backupCodes: [] // Cognito doesn't provide backup codes directly
      };

    } catch (error: any) {
      logger.error('Cognito MFA setup failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async verifyMFA(accessToken: string, code: string): Promise<AuthResult> {
    try {
      const verifyCommand = new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: code
      });

      await this.client.send(verifyCommand);

      // Enable MFA for the user
      const enableCommand = new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true
        }
      });

      await this.client.send(enableCommand);

      return {
        success: true,
        user: {
          uid: '',
          email: ''
        }
      };

    } catch (error: any) {
      logger.error('Cognito MFA verification failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async disableMFA(accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const command = new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: {
          Enabled: false,
          PreferredMfa: false
        }
      });

      await this.client.send(command);

      return { success: true };

    } catch (error: any) {
      logger.error('Cognito MFA disable failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    try {
      const command = new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken
        }
      });

      const response = await this.client.send(command);

      if (!response.AuthenticationResult) {
        return {
          success: false,
          error: 'Token refresh failed'
        };
      }

      return {
        success: true,
        tokens: {
          accessToken: response.AuthenticationResult.AccessToken!,
          idToken: response.AuthenticationResult.IdToken!,
          refreshToken: response.AuthenticationResult.RefreshToken || refreshToken,
          expiresAt: Date.now() + (response.AuthenticationResult.ExpiresIn! * 1000)
        }
      };

    } catch (error: any) {
      logger.error('Cognito token refresh failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  async validateToken(token: string): Promise<AuthResult> {
    try {
      const payload = await this.jwtVerifier.verify(token);

      return {
        success: true,
        user: {
          uid: payload.sub,
          email: payload.email as string,
          firstName: payload.given_name as string,
          lastName: payload.family_name as string,
          emailVerified: payload.email_verified as boolean
        }
      };

    } catch (error: any) {
      logger.error('Cognito token validation failed', { error: error.message });
      return {
        success: false,
        error: 'Invalid or expired token'
      };
    }
  }

  async signOut(accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const command = new GlobalSignOutCommand({
        AccessToken: accessToken
      });

      await this.client.send(command);

      return { success: true };

    } catch (error: any) {
      logger.error('Cognito sign out failed', { error: error.message });
      return {
        success: false,
        error: this.mapCognitoError(error)
      };
    }
  }

  isAvailable(): boolean {
    return !!(this.userPoolId && this.clientId && this.region);
  }

  async getHealthStatus(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; responseTime?: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Simple health check - try to describe user pool
      const command = new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: 'health-check-user',
          PASSWORD: 'invalid-password'
        }
      });

      await this.client.send(command);

      // We expect this to fail, but if it reaches here, Cognito is responding
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Expected errors indicate Cognito is working
      if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
        return {
          status: 'healthy',
          responseTime
        };
      }

      return {
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  private mapCognitoError(error: any): string {
    const errorMap: { [key: string]: string } = {
      'UserNotFoundException': 'User not found',
      'NotAuthorizedException': 'Invalid credentials',
      'UserNotConfirmedException': 'Email not verified',
      'InvalidParameterException': 'Invalid parameters',
      'TooManyRequestsException': 'Too many requests, please try again later',
      'LimitExceededException': 'Limit exceeded',
      'InvalidPasswordException': 'Password does not meet requirements',
      'UsernameExistsException': 'User already exists',
      'CodeMismatchException': 'Invalid verification code',
      'ExpiredCodeException': 'Verification code expired'
    };

    return errorMap[error.name] || error.message || 'Authentication error occurred';
  }
}