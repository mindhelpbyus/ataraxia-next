
import { AuthProvider, AuthResponse, AuthUser } from '../AuthProvider';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { credential } from 'firebase-admin';

export class FirebaseProvider implements AuthProvider {
    private auth: Auth;
    private app: App;

    constructor(projectId: string, clientEmail?: string, privateKey?: string) {
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
        // Firebase Admin SDK does not support signInWithEmailAndPassword (that is for Client SDKs).
        // In a backend context, we usually verify an ID token sent from the client.
        // However, to satisfy the generic interface for server-side operations, we would integration with Google Identity Toolkit REST API
        // or arguably, this method isn't used server-side for Firebase usually.

        // For this demonstration, we throw an error guiding to client-side auth
        throw new Error('Firebase Server-Side Login not supported directly in Admin SDK. Use Client SDK to get ID Token, then use verifyToken on backend.');
    }

    async verifyToken(token: string): Promise<AuthUser> {
        const decoded = await this.auth.verifyIdToken(token);

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

    // Stubs for methods handled by Firebase Client SDK
    async confirmSignUp(email: string, code: string): Promise<boolean> { return true; }
    async resendConfirmationCode(email: string): Promise<boolean> { return true; }
    async forgotPassword(email: string): Promise<boolean> { return true; }
    async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> { return true; }

    async refreshToken(refreshToken: string): Promise<AuthResponse> {
        throw new Error('Firebase refresh token not supported server-side');
    }
}
