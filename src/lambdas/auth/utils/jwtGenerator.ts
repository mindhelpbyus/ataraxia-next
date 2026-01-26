/**
 * JWT Generator - Exact same logic as your Express version
 * Maintains compatibility with your frontend
 */
import jwt from 'jsonwebtoken';

export const generateToken = (user_id: number, email: string, role: string) => {
    const payload = {
        user: {
            id: user_id,
            email: email,
            role: role
        }
    };

    // Allow customizing secret via env, default to a dev secret
    const secret = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod';

    // Token valid for 1 hour by default
    return jwt.sign(payload, secret, { expiresIn: '1h' });
};