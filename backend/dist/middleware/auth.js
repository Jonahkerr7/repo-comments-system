"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.optionalAuth = optionalAuth;
const config_1 = require("../auth/config");
const db_1 = require("../db");
const logger_1 = require("../logger");
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.token;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : cookieToken;
        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const payload = (0, config_1.verifyToken)(token);
        // Fetch full user from database
        const result = await (0, db_1.query)('SELECT * FROM users WHERE id = $1', [payload.id]);
        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        req.user = result.rows[0];
        next();
    }
    catch (error) {
        logger_1.logger.error('Authentication error', error);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
function authorize(requiredRole) {
    return async (req, res, next) => {
        const authReq = req;
        const repo = req.params.repo || req.body.repo || req.query.repo;
        if (!authReq.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!repo) {
            res.status(400).json({ error: 'Repository not specified' });
            return;
        }
        try {
            // Check user permissions for this repo
            const permissions = await (0, db_1.query)(`SELECT role FROM user_permissions
         WHERE user_id = $1 AND repo = $2`, [authReq.user.id, repo]);
            if (permissions.rows.length === 0) {
                res.status(403).json({ error: 'Access denied to this repository' });
                return;
            }
            const userRole = permissions.rows[0].role;
            // Role hierarchy: admin > write > read
            const roleHierarchy = { read: 1, write: 2, admin: 3 };
            const hasPermission = roleHierarchy[userRole] >=
                roleHierarchy[requiredRole];
            if (!hasPermission) {
                res.status(403).json({
                    error: `Insufficient permissions. Required: ${requiredRole}, has: ${userRole}`,
                });
                return;
            }
            next();
        }
        catch (error) {
            logger_1.logger.error('Authorization error', error);
            res.status(500).json({ error: 'Authorization check failed' });
        }
    };
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.token;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : cookieToken;
    if (!token) {
        next();
        return;
    }
    try {
        const payload = (0, config_1.verifyToken)(token);
        (0, db_1.query)('SELECT * FROM users WHERE id = $1', [payload.id])
            .then((result) => {
            if (result.rows.length > 0) {
                req.user = result.rows[0];
            }
            next();
        })
            .catch((error) => {
            logger_1.logger.error('Optional auth error', error);
            next();
        });
    }
    catch (error) {
        next();
    }
}
//# sourceMappingURL=auth.js.map