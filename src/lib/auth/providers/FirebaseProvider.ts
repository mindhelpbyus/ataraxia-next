
import { AuthProvider, AuthResponse, AuthUser } from '../AuthProvider';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { credential } from 'firebase-admin';
import axios from 'axios';

export class FirebaseProvider implements AuthProvider {
    private auth: Auth;
    private app: App;
    private apiKey?: string;

    constructor(projectId: string, clientEmail?: string, privateKey?: string, apiKey?: string) {
        this.apiKey = apiKey;
        if (!getApps().length) {
            this.app = initializeApp({
                credential: clientEmail && privateKey
                    ? credential.cert({ projectId, clientEmail, privateKey })
                    : credential.applicationDefault()
            });
        } else {
            this.app = getApps()[0];
        }
        this.auth = getAuth(this.app);
    }

    async signUp(
        email: string,
        password: string,
        attributes: { firstName: string; lastName: string; role: string; phoneNumber?: string; countryCode?: string }
    ): Promise<string> {
        const user = await this.auth.createUser({
            email,
            password,
            displayName: `${attributes.firstName} ${attributes.lastName}`,
            phoneNumber: attributes.phoneNumber ? `${attributes.countryCode || '+1'}${attributes.phoneNumber.replace(/\D/g, '')}` : undefined,
        });

        await this.auth.setCustomUserClaims(user.uid, {
            role: attributes.role,
            firstName: attributes.firstName,
            lastName: attributes.lastName
        });

        return user.uid;
    }

    async signIn(email: string, password: string): Promise<AuthResponse> {
        if (!this.apiKey) {
            throw new Error('Firebase API Key is required for server-side login operations. Please configure FIREBASE_API_KEY.');
        }

        try {
            const response = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`, {
                email,
                password,
                returnSecureToken: true
            });

            const data = response.data as any;

            // Verify the token to get populated user object using existing method
            const user = await this.verifyToken(data.idToken);

            return {
                user,
                tokens: {
                    accessToken: data.idToken,
                    idToken: data.idToken,
                    refreshToken: data.refreshToken,
                    expiresIn: parseInt(data.expiresIn, 10)
                }
            };
        } catch (error: any) {
            throw new Error(error.response?.data?.error?.message || 'Authentication failed');
        }
    }

    async verifyToken(token: string): Promise<AuthUser> {
        const decoded = await this.auth.verifyIdToken(token) as any;

        return {
            id: decoded.uid,
            email: decoded.email || '',
            firstName: (decoded.firstName as string) || (decoded.name?.split(' ')[0]) || '',
            lastName: (decoded.lastName as string) || (decoded.name?.split(' ').slice(1).join(' ')) || '',
            role: (decoded.role as string) || 'client',
            emailVerified: decoded.email_verified || false,
            phoneNumber: decoded.phone_number,
            metadata: decoded
        };
    }

    async confirmSignUp(email: string, code: string): Promise<boolean> {
        // Email verification via code (OOB) is tricky without ID token context if relying purely on REST.
        // However, 'oobCode' sent via email link can be verified.
        // If "code" passed here IS the oobCode from the link, we can use it.
        throw new Error('Confirm Sign Up (Email Verification) checks are mostly handled on client side via link. To verify on backend, use the OOB Code from the link.');
    }

    async resendConfirmationCode(email: string): Promise<boolean> {
        if (!this.apiKey) throw new Error('API Key required');

        // Log link for dev environment since email sending is not configured
        const link = await this.auth.generateEmailVerificationLink(email);
        console.log(`[REAL AUTH] Generated Email Verification Link for ${email}: ${link}`);
        return true;
    }

    async forgotPassword(email: string): Promise<boolean> {
        if (!this.apiKey) throw new Error('API Key required');

        try {
            await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this.apiKey}`, {
                requestType: 'PASSWORD_RESET',
                email
            });
            return true;
        } catch (error: any) {
            throw new Error(error.response?.data?.error?.message || 'Failed to send reset email');
        }
    }

    async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
        if (!this.apiKey) throw new Error('API Key required');

        try {
            await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${this.apiKey}`, {
                oobCode: code,
                newPassword
            });
            return true;
        } catch (error: any) {
            throw new Error(error.response?.data?.error?.message || 'Failed to reset password');
        }
    }

    async refreshToken(refreshToken: string): Promise<AuthResponse> {
        if (!this.apiKey) throw new Error('API Key required');

        try {
            const response = await axios.post(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });

            const data = response.data as any;

            const user = await this.verifyToken(data.id_token);

            return {
                user,
                tokens: {
                    accessToken: data.id_token,
                    idToken: data.id_token,
                    refreshToken: data.refresh_token,
                    expiresIn: parseInt(data.expires_in, 10)
                }
            };
        } catch (error: any) {
            throw new Error(error.response?.data?.error?.message || 'Token refresh failed');
        }
    }
}
