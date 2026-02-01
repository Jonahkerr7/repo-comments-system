"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
// Get all users
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const result = await (0, db_1.query)(`SELECT
        u.id,
        u.email,
        u.name,
        u.provider,
        u.avatar_url,
        u.created_at,
        ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as teams
       FROM users u
       LEFT JOIN team_members tm ON u.id = tm.user_id
       LEFT JOIN teams t ON tm.team_id = t.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`);
        res.json(result.rows);
    }
    catch (error) {
        logger_1.logger.error('Error fetching users', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// Get a single user
router.get('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    try {
        const userResult = await (0, db_1.query)(`SELECT
        u.id,
        u.email,
        u.name,
        u.provider,
        u.avatar_url,
        u.created_at
       FROM users u
       WHERE u.id = $1`, [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];
        // Get teams
        const teamsResult = await (0, db_1.query)(`SELECT t.id, t.name, tm.role
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1`, [id]);
        user.teams = teamsResult.rows;
        // Get permissions
        const permsResult = await (0, db_1.query)(`SELECT repo, role
       FROM permissions
       WHERE user_id = $1`, [id]);
        user.permissions = permsResult.rows;
        res.json(user);
    }
    catch (error) {
        logger_1.logger.error('Error fetching user', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
// Update a user (limited fields)
router.patch('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const result = await (0, db_1.query)('UPDATE users SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        logger_1.logger.info('User updated', { userId: id });
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error updating user', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map