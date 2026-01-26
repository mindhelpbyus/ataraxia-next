"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.authenticateUser = authenticateUser;
exports.verifyCognitoToken = verifyCognitoToken;
exports.confirmSignUp = confirmSignUp;
exports.resendConfirmationCode = resendConfirmationCode;
exports.forgotPassword = forgotPassword;
exports.confirmForgotPassword = confirmForgotPassword;
exports.createTherapistUser = createTherapistUser;
exports.updateUserAttributes = updateUserAttributes;
exports.getUser = getUser;
/**
 * AWS Cognito Authentication Service
 * Replaces Firebase for healthcare-focused authentication
 */
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const aws_jwt_verify_1 = require("aws-jwt-verify");
// Initialize Cognito client
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-west-2'
});
// Cognito configuration
const COGNITO_CONFIG = {
    userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_AtaraxiaPool',
    clientId: process.env.COGNITO_CLIENT_ID || 'ataraxia-client-id',
    region: process.env.AWS_REGION || 'us-west-2'
};
// JWT Verifiers for token validation
const accessTokenVerifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: COGNITO_CONFIG.userPoolId,
    tokenUse: 'access',
    clientId: COGNITO_CONFIG.clientId,
});
const idTokenVerifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: COGNITO_CONFIG.userPoolId,
    tokenUse: 'id',
    clientId: COGNITO_CONFIG.clientId,
});
// Helper function to extract user info from Cognito ID token payload
function mapCognitoPayloadToUser(payload) {
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
async function registerUser(email, password, firstName, lastName, role = 'client', phoneNumber) {
    try {
        const command = new client_cognito_identity_provider_1.SignUpCommand({
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
            userSub: response.UserSub,
            needsVerification: !response.UserConfirmed
        };
    }
    catch (error) {
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
async function authenticateUser(email, password) {
    try {
        const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
            ClientId: COGNITO_CONFIG.clientId,
            AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
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
        const payload = await idTokenVerifier.verify(IdToken);
        return {
            accessToken: AccessToken,
            idToken: IdToken,
            refreshToken: RefreshToken,
            user: mapCognitoPayloadToUser(payload)
        };
    }
    catch (error) {
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
async function verifyCognitoToken(token, tokenType = 'id') {
    try {
        const verifier = tokenType === 'access' ? accessTokenVerifier : idTokenVerifier;
        const payload = await verifier.verify(token);
        return mapCognitoPayloadToUser(payload);
    }
    catch (error) {
        console.error('Token verification error:', error);
        throw new Error(`Invalid token: ${error.message}`);
    }
}
/**
 * Confirm user email verification
 * Required after registration
 */
async function confirmSignUp(email, confirmationCode) {
    try {
        const command = new client_cognito_identity_provider_1.ConfirmSignUpCommand({
            ClientId: COGNITO_CONFIG.clientId,
            Username: email,
            ConfirmationCode: confirmationCode
        });
        await cognitoClient.send(command);
    }
    catch (error) {
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
async function resendConfirmationCode(email) {
    try {
        const command = new client_cognito_identity_provider_1.ResendConfirmationCodeCommand({
            ClientId: COGNITO_CONFIG.clientId,
            Username: email
        });
        await cognitoClient.send(command);
    }
    catch (error) {
        console.error('Resend confirmation error:', error);
        throw new Error(`Failed to resend confirmation: ${error.message}`);
    }
}
/**
 * Initiate password reset
 * Sends reset code to user's email
 */
async function forgotPassword(email) {
    try {
        const command = new client_cognito_identity_provider_1.ForgotPasswordCommand({
            ClientId: COGNITO_CONFIG.clientId,
            Username: email
        });
        await cognitoClient.send(command);
    }
    catch (error) {
        console.error('Forgot password error:', error);
        throw new Error(`Password reset failed: ${error.message}`);
    }
}
/**
 * Confirm password reset with code
 */
async function confirmForgotPassword(email, confirmationCode, newPassword) {
    try {
        const command = new client_cognito_identity_provider_1.ConfirmForgotPasswordCommand({
            ClientId: COGNITO_CONFIG.clientId,
            Username: email,
            ConfirmationCode: confirmationCode,
            Password: newPassword
        });
        await cognitoClient.send(command);
    }
    catch (error) {
        console.error('Password reset confirmation error:', error);
        throw new Error(`Password reset failed: ${error.message}`);
    }
}
/**
 * Admin function: Create therapist user with verification
 * Used when admin approves therapist registration
 */
async function createTherapistUser(email, firstName, lastName, licenseNumber, tempPassword) {
    try {
        const command = new client_cognito_identity_provider_1.AdminCreateUserCommand({
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
            MessageAction: client_cognito_identity_provider_1.MessageActionType.SUPPRESS // Don't send welcome email
        });
        const response = await cognitoClient.send(command);
        // Set permanent password
        await cognitoClient.send(new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
            UserPoolId: COGNITO_CONFIG.userPoolId,
            Username: email,
            Password: tempPassword,
            Permanent: true
        }));
        // Add to therapist group
        await cognitoClient.send(new client_cognito_identity_provider_1.AdminAddUserToGroupCommand({
            UserPoolId: COGNITO_CONFIG.userPoolId,
            Username: email,
            GroupName: 'therapists'
        }));
        return response.User.Username;
    }
    catch (error) {
        console.error('Create therapist user error:', error);
        throw new Error(`Failed to create therapist: ${error.message}`);
    }
}
/**
 * Update user attributes (for profile updates)
 */
async function updateUserAttributes(email, attributes) {
    try {
        const userAttributes = Object.entries(attributes).map(([name, value]) => ({
            Name: name,
            Value: value
        }));
        const command = new client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand({
            UserPoolId: COGNITO_CONFIG.userPoolId,
            Username: email,
            UserAttributes: userAttributes
        });
        await cognitoClient.send(command);
    }
    catch (error) {
        console.error('Update user attributes error:', error);
        throw new Error(`Failed to update user: ${error.message}`);
    }
}
/**
 * Get user by email (admin function)
 */
async function getUser(email) {
    try {
        const command = new client_cognito_identity_provider_1.AdminGetUserCommand({
            UserPoolId: COGNITO_CONFIG.userPoolId,
            Username: email
        });
        const response = await cognitoClient.send(command);
        // Convert Cognito user attributes to our format
        const attributes = response.UserAttributes || [];
        const user = {
            sub: response.Username
        };
        attributes.forEach(attr => {
            if (attr.Name && attr.Value) {
                user[attr.Name] = attr.Value;
            }
        });
        return user;
    }
    catch (error) {
        if (error.name === 'UserNotFoundException') {
            return null;
        }
        console.error('Get user error:', error);
        throw new Error(`Failed to get user: ${error.message}`);
    }
}
//# sourceMappingURL=cognito.js.map