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

    // Require JWT_SECRET from environment
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }

    // Token valid for 1 hour by default
    return jwt.sign(payload, secret, { expiresIn: '1h' });
};