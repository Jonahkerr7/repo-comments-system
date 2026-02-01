"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
const passport_1 = __importDefault(require("passport"));
const passport_github2_1 = require("passport-github2");
const passport_google_oauth20_1 = require("passport-google-oauth20");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const logger_1 = require("../logger");
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
function generateToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
async function findOrCreateUser(email, name, provider, providerId, avatarUrl) {
    // Try to find existing user
    const existingUser = await (0, db_1.query)('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', [provider, providerId]);
    if (existingUser.rows.length > 0) {
        // Update last login
        await (0, db_1.query)('UPDATE users SET last_login = NOW() WHERE id = $1', [existingUser.rows[0].id]);
        return existingUser.rows[0];
    }
    // Create new user
    const newUser = await (0, db_1.query)(`INSERT INTO users (email, name, provider, provider_id, avatar_url, last_login)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`, [email, name, provider, providerId, avatarUrl || null]);
    logger_1.logger.info('New user created', { email, provider });
    return newUser.rows[0];
}
// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport_1.default.use(new passport_github2_1.Strategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ['user:email'],
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
            const user = await findOrCreateUser(email, profile.displayName || profile.username || 'GitHub User', 'github', profile.id, profile.photos?.[0]?.value);
            done(null, user);
        }
        catch (error) {
            logger_1.logger.error('GitHub OAuth error', error);
            done(error);
        }
    }));
}
// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
                return done(new Error('No email provided by Google'));
            }
            const user = await findOrCreateUser(email, profile.displayName || 'Google User', 'google', profile.id, profile.photos?.[0]?.value);
            done(null, user);
        }
        catch (error) {
            logger_1.logger.error('Google OAuth error', error);
            done(error);
        }
    }));
}
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const result = await (0, db_1.query)('SELECT * FROM users WHERE id = $1', [id]);
        done(null, result.rows[0]);
    }
    catch (error) {
        done(error);
    }
});
exports.default = passport_1.default;
//# sourceMappingURL=config.js.map