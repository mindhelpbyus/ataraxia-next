
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
    SignUpCommand,
    ConfirmSignUpCommand,
    ResendConfirmationCodeCommand,
    ForgotPasswordCommand,
    ConfirmForgotPasswordCommand,
    AuthFlowType
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthProvider, AuthResponse, AuthUser } from '../AuthProvider';

export class CognitoProvider implements AuthProvider {
    private client: CognitoIdentityProviderClient;
    private verifier: any;
    private clientId: string;
    private userPoolId: string;

    constructor(region: string, userPoolId: string, clientId: string) {
        this.client = new CognitoIdentityProviderClient({ region });
        this.clientId = clientId;
        this.userPoolId = userPoolId;

        this.verifier = CognitoJwtVerifier.create({
            userPoolId: userPoolId,
            tokenUse: "id",
            clientId: clientId,
        });
    }

    async signUp(
        email: string,
        password: string,
        attributes: { firstName: string; lastName: string; role: string; phoneNumber?: string; countryCode?: string }
    ): Promise<string> {
        const userAttributes = [
            { Name: 'email', Value: email },
            { Name: 'given_name', Value: attributes.firstName },
            { Name: 'family_name', Value: attributes.lastName },
            { Name: 'custom:role', Value: attributes.role }
        ];

        if (attributes.phoneNumber && attributes.countryCode) {
            // Format: +1234567890
            const cleanPhone = attributes.phoneNumber.replace(/\D/g, '');
            const cleanCountry = attributes.countryCode.startsWith('+') ? attributes.countryCode : `+${attributes.countryCode}`;
            userAttributes.push({ Name: 'phone_number', Value: `${cleanCountry}${cleanPhone}` });
        }

        const command = new SignUpCommand({
            ClientId: this.clientId,
            Username: email,
            Password: password,
            UserAttributes: userAttributes
        });

        const response = await this.client.send(command);
        return response.UserSub!;
    }

    async signIn(email: string, password: string): Promise<AuthResponse> {
        const command = new InitiateAuthCommand({
            ClientId: this.clientId,
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        });

        const response = await this.client.send(command);
        const result = response.AuthenticationResult;

        if (!result || !result.IdToken || !result.AccessToken) {
            throw new Error('Authentication failed: No tokens received');
        }

        // Verify token to get user details immediately
        const user = await this.verifyToken(result.IdToken);

        return {
            user,
            tokens: {
                accessToken: result.AccessToken,
                idToken: result.IdToken,
                refreshToken: result.RefreshToken || '',
                expiresIn: result.ExpiresIn || 3600
            }
        };
    }

    async confirmSignUp(email: string, code: string): Promise<boolean> {
        const command = new ConfirmSignUpCommand({
            ClientId: this.clientId,
            Username: email,
            ConfirmationCode: code
        });

        await this.client.send(command);
        return true;
    }

    async resendConfirmationCode(email: string): Promise<boolean> {
        const command = new ResendConfirmationCodeCommand({
            ClientId: this.clientId,
            Username: email
        });

        await this.client.send(command);
        return true;
    }

    async forgotPassword(email: string): Promise<boolean> {
        const command = new ForgotPasswordCommand({
            ClientId: this.clientId,
            Username: email
        });

        await this.client.send(command);
        return true;
    }

    async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
        const command = new ConfirmForgotPasswordCommand({
            ClientId: this.clientId,
            Username: email,
            ConfirmationCode: code,
            Password: newPassword
        });

        await this.client.send(command);
        return true;
    }

    async verifyToken(token: string): Promise<AuthUser> {
        const payload = await this.verifier.verify(token);

        return {
            id: payload.sub,
            email: String(payload.email),
            firstName: String(payload.given_name || ''),
            lastName: String(payload.family_name || ''),
            role: String(payload['custom:role'] || 'client'),
            emailVerified: payload.email_verified === true || payload.email_verified === 'true',
            metadata: payload
        };
    }

    async refreshToken(refreshToken: string): Promise<AuthResponse> {
        const command = new InitiateAuthCommand({
            ClientId: this.clientId,
            AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken
            }
        });

        const response = await this.client.send(command);
        const result = response.AuthenticationResult;

        if (!result || !result.IdToken || !result.AccessToken) {
            throw new Error('Refresh failed: No tokens received');
        }

        // Verify new token to get user details
        const user = await this.verifyToken(result.IdToken);

        return {
            user,
            tokens: {
                accessToken: result.AccessToken,
                idToken: result.IdToken,
                // Cognito might not return a new refresh token, so reuse the old one if needed
                refreshToken: result.RefreshToken || refreshToken,
                expiresIn: result.ExpiresIn || 3600
            }
        };
    }
}
