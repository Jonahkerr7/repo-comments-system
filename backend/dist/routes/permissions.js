"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
// Get permissions (with optional repo filter)
router.get('/', auth_1.authenticate, async (req, res) => {
    const { repo } = req.query;
    try {
        let queryText = `
      SELECT
        p.*,
        u.name as user_name,
        u.email as user_email,
        t.name as team_name
      FROM permissions p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN teams t ON p.team_id = t.id
    `;
        const params = [];
        if (repo) {
            queryText += ' WHERE p.repo = $1';
            params.push(repo);
        }
        queryText += ' ORDER BY p.repo, p.role DESC';
        const result = await (0, db_1.query)(queryText, params);
        res.json(result.rows);
    }
    catch (error) {
        logger_1.logger.error('Error fetching permissions', error);
        res.status(500).json({ error: 'Failed to fetch permissions' });
    }
});
// Create a permission
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.body)('role').isIn(['read', 'write', 'admin']).withMessage('Invalid role'),
    (0, express_validator_1.body)('user_id').optional().isUUID(),
    (0, express_validator_1.body)('team_id').optional().isUUID(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { repo, role, user_id, team_id } = req.body;
    // Must specify either user_id or team_id, but not both
    if ((!user_id && !team_id) || (user_id && team_id)) {
        return res.status(400).json({ error: 'Must specify either user_id or team_id, but not both' });
    }
    try {
        const result = await (0, db_1.query)(`INSERT INTO permissions (repo, user_id, team_id, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, [repo, user_id || null, team_id || null, role]);
        logger_1.logger.info('Permission created', {
            repo,
            userId: user_id,
            teamId: team_id,
            role,
        });
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Permission already exists' });
        }
        logger_1.logger.error('Error creating permission', error);
        res.status(500).json({ error: 'Failed to create permission' });
    }
});
// Update a permission
router.patch('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (!role || !['read', 'write', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    try {
        const result = await (0, db_1.query)('UPDATE permissions SET role = $1 WHERE id = $2 RETURNING *', [role, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Permission not found' });
        }
        logger_1.logger.info('Permission updated', { permissionId: id, role });
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error updating permission', error);
        res.status(500).json({ error: 'Failed to update permission' });
    }
});
// Delete a permission
router.delete('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM permissions WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Permission not found' });
        }
        logger_1.logger.info('Permission deleted', { permissionId: id });
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Error deleting permission', error);
        res.status(500).json({ error: 'Failed to delete permission' });
    }
});
exports.default = router;
//# sourceMappingURL=permissions.js.map