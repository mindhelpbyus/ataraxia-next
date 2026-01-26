/**
 * AWS Cognito Authentication Service
 * Replaces Firebase for healthcare-focused authentication
 */
import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersCommand,
  AuthFlowType,
  MessageActionType
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-west-2'
});

// Cognito configuration
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_AtaraxiaPool',
  clientId: process.env.COGNITO_CLIENT_ID || 'ataraxia-client-id',
  region: process.env.AWS_REGION || 'us-west-2'
};

// JWT Verifiers for token validation
const accessTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_CONFIG.userPoolId,
  tokenUse: 'access',
  clientId: COGNITO_CONFIG.clientId,
});

const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_CONFIG.userPoolId,
  tokenUse: 'id',
  clientId: COGNITO_CONFIG.clientId,
});

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

// Helper function to extract user info from Cognito ID token payload
function mapCognitoPayloadToUser(payload: any): CognitoUser {
  return {
    sub: payload.sub,
    email: payload.email || payload['cognito:username'],
    email_verified: payload.email_verified === 'true' || payload.email_verified === true,
    phone_number: payload.phone_number,
    phone_number_verified: payload.phone_number_verified === 'true' || payload.phone_number_verified === true,
    given_name: payload.given_name,
    family_name: payload.family_name,
    'custom:role': payload['custom:role'],
    'custom:license_number': payload['custom:license_number'],
    'custom:verification_status': payload['custom:verification_status']
  };
}

/**
 * Register new user with Cognito
 * Perfect for therapy app - professional email registration
 */
export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string = 'client',
  phoneNumber?: string
): Promise<{ userSub: string; needsVerification: boolean }> {
  try {
    const command = new SignUpCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
        { Name: 'custom:role', Value: role },
        ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : [])
      ]
    });

    const response = await cognitoClient.send(command);
    
    return {
      userSub: response.UserSub!,
      needsVerification: !response.UserConfirmed
    };
  } catch (error: any) {
    console.error('Cognito registration error:', error);
    
    if (error.name === 'UsernameExistsException') {
      throw new Error('User already exists');
    }
    if (error.name === 'InvalidPasswordException') {
      throw new Error('Password does not meet requirements');
    }
    
    throw new Error(`Registration failed: ${error.message}`);
  }
}

/**
 * Authenticate user with Cognito
 * Returns JWT tokens for session management
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{
  accessToken: string;
  idToken: string;
  refreshToken: string;
  user: CognitoUser;
}> {
  try {
    const command = new InitiateAuthCommand({
      ClientId: COGNITO_CONFIG.clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    const response = await cognitoClient.send(command);
    
    if (!response.AuthenticationResult) {
      throw new Error('Authentication failed');
    }

    const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult;
    
    // Verify and decode the ID token to get user info (ID tokens contain user claims)
    const payload = await idTokenVerifier.verify(IdToken!);
    
    return {
      accessToken: AccessToken!,
      idToken: IdToken!,
      refreshToken: RefreshToken!,
      user: mapCognitoPayloadToUser(payload)
    };
  } catch (error: any) {
    console.error('Cognito authentication error:', error);
    
    if (error.name === 'NotAuthorizedException') {
      throw new Error('Invalid email or password');
    }
    if (error.name === 'UserNotConfirmedException') {
      throw new Error('Please verify your email address');
    }
    
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Verify Cognito JWT token
 * Replaces Firebase token verification
 * Use ID token for user info, access token for API access
 */
export async function verifyCognitoToken(token: string, tokenType: 'access' | 'id' = 'id'): Promise<CognitoUser> {
  try {
    const verifier = tokenType === 'access' ? accessTokenVerifier : idTokenVerifier;
    const payload = await verifier.verify(token);
    return mapCognitoPayloadToUser(payload);
  } catch (error: any) {
    console.error('Token verification error:', error);
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Confirm user email verification
 * Required after registration
 */
export async function confirmSignUp(
  email: string,
  confirmationCode: string
): Promise<void> {
  try {
    const command = new ConfirmSignUpCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      ConfirmationCode: confirmationCode
    });

    await cognitoClient.send(command);
  } catch (error: any) {
    console.error('Email confirmation error:', error);
    
    if (error.name === 'CodeMismatchException') {
      throw new Error('Invalid confirmation code');
    }
    if (error.name === 'ExpiredCodeException') {
      throw new Error('Confirmation code has expired');
    }
    
    throw new Error(`Email confirmation failed: ${error.message}`);
  }
}

/**
 * Resend email verification code
 */
export async function resendConfirmationCode(email: string): Promise<void> {
  try {
    const command = new ResendConfirmationCodeCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email
    });

    await cognitoClient.send(command);
  } catch (error: any) {
    console.error('Resend confirmation error:', error);
    throw new Error(`Failed to resend confirmation: ${error.message}`);
  }
}

/**
 * Initiate password reset
 * Sends reset code to user's email
 */
export async function forgotPassword(email: string): Promise<void> {
  try {
    const command = new ForgotPasswordCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email
    });

    await cognitoClient.send(command);
  } catch (error: any) {
    console.error('Forgot password error:', error);
    throw new Error(`Password reset failed: ${error.message}`);
  }
}

/**
 * Confirm password reset with code
 */
export async function confirmForgotPassword(
  email: string,
  confirmationCode: string,
  newPassword: string
): Promise<void> {
  try {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    });

    await cognitoClient.send(command);
  } catch (error: any) {
    console.error('Password reset confirmation error:', error);
    throw new Error(`Password reset failed: ${error.message}`);
  }
}

/**
 * Admin function: Create therapist user with verification
 * Used when admin approves therapist registration
 */
export async function createTherapistUser(
  email: string,
  firstName: string,
  lastName: string,
  licenseNumber: string,
  tempPassword: string
): Promise<string> {
  try {
    const command = new AdminCreateUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
        { Name: 'custom:role', Value: 'therapist' },
        { Name: 'custom:license_number', Value: licenseNumber },
        { Name: 'custom:verification_status', Value: 'approved' }
      ],
      TemporaryPassword: tempPassword,
      MessageAction: MessageActionType.SUPPRESS // Don't send welcome email
    });

    const response = await cognitoClient.send(command);
    
    // Set permanent password
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email,
      Password: tempPassword,
      Permanent: true
    }));

    // Add to therapist group
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email,
      GroupName: 'therapists'
    }));

    return response.User!.Username!;
  } catch (error: any) {
    console.error('Create therapist user error:', error);
    throw new Error(`Failed to create therapist: ${error.message}`);
  }
}

/**
 * Update user attributes (for profile updates)
 */
export async function updateUserAttributes(
  email: string,
  attributes: Record<string, string>
): Promise<void> {
  try {
    const userAttributes = Object.entries(attributes).map(([name, value]) => ({
      Name: name,
      Value: value
    }));

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email,
      UserAttributes: userAttributes
    });

    await cognitoClient.send(command);
  } catch (error: any) {
    console.error('Update user attributes error:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }
}

/**
 * Get user by email (admin function)
 */
export async function getUser(email: string): Promise<CognitoUser | null> {
  try {
    const command = new AdminGetUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: email
    });

    const response = await cognitoClient.send(command);
    
    // Convert Cognito user attributes to our format
    const attributes = response.UserAttributes || [];
    const user: any = {
      sub: response.Username
    };

    attributes.forEach(attr => {
      if (attr.Name && attr.Value) {
        user[attr.Name] = attr.Value;
      }
    });

    return user as CognitoUser;
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return null;
    }
    
    console.error('Get user error:', error);
    throw new Error(`Failed to get user: ${error.message}`);
  }
}