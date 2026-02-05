"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = void 0;
/**
 * JWT Generator - Exact same logic as your Express version
 * Maintains compatibility with your frontend
 */
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateToken = (user_id, email, role) => {
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
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: '1h' });
};
exports.generateToken = generateToken;
//# sourceMappingURL=jwtGenerator.js.map