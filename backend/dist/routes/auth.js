"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = __importDefault(require("../auth/config"));
const config_2 = require("../auth/config");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GitHub OAuth
router.get('/github', config_1.default.authenticate('github', { session: false }));
router.get('/github/callback', config_1.default.authenticate('github', { session: false, failureRedirect: '/login' }), (req, res) => {
    const user = req.user;
    const token = (0, config_2.generateToken)({
        id: user.id,
        email: user.email,
        name: user.name,
    });
    // Set cookie for browser-based clients
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    // Detect which frontend to redirect to based on state parameter
    const state = req.query.state;
    let redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // Check if state contains a redirect URL
    if (state) {
        try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            if (stateData.redirect_uri) {
                redirectUrl = stateData.redirect_uri;
            }
        }
        catch (e) {
            // Invalid state, use default
        }
    }
    // Redirect to frontend with token in query
    res.redirect(`${redirectUrl}?token=${token}`);
});
// Google OAuth
router.get('/google', config_1.default.authenticate('google', {
    session: false,
    scope: ['profile', 'email']
}));
router.get('/google/callback', config_1.default.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
    const user = req.user;
    const token = (0, config_2.generateToken)({
        id: user.id,
        email: user.email,
        name: user.name,
    });
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/auth/callback?token=${token}`);
});
// Get current user
router.get('/user', auth_1.authenticate, async (req, res) => {
    const authReq = req;
    res.json({
        id: authReq.user.id,
        email: authReq.user.email,
        name: authReq.user.name,
        avatar_url: authReq.user.avatar_url,
    });
});
// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});
// Development login (for testing without OAuth)
router.get('/dev-login', async (req, res) => {
    // Only available in development
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    try {
        const { query: dbQuery } = await Promise.resolve().then(() => __importStar(require('../db')));
        // Get the first user from the database
        const result = await dbQuery('SELECT * FROM users LIMIT 1');
        let user;
        if (result.rows.length === 0) {
            // Create a dev user if none exists
            const newUser = await dbQuery(`INSERT INTO users (email, name, provider, provider_id)
         VALUES ('admin@dev.local', 'Dev Admin', 'dev', 'dev-001')
         RETURNING *`);
            user = newUser.rows[0];
        }
        else {
            user = result.rows[0];
        }
        const token = (0, config_2.generateToken)({
            id: user.id,
            email: user.email,
            name: user.name,
        });
        // Get redirect URL from query or state
        let redirectUrl = req.query.redirect || 'http://localhost:9000';
        if (req.query.state) {
            try {
                const stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
                if (stateData.redirect_uri) {
                    redirectUrl = stateData.redirect_uri;
                }
            }
            catch (e) {
                // Use default
            }
        }
        res.redirect(`${redirectUrl}?token=${token}`);
    }
    catch (error) {
        console.error('Dev login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map