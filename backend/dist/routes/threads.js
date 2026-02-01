"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
// Validation middleware
const validateThread = [
    (0, express_validator_1.body)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.body)('branch').notEmpty().withMessage('Branch is required'),
    (0, express_validator_1.body)('context_type').isIn(['code', 'ui']).withMessage('Invalid context type'),
    (0, express_validator_1.body)('message').notEmpty().withMessage('Initial message is required'),
];
// Create a new thread
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('write'), validateThread, async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const authReq = req;
    const data = req.body;
    try {
        // Validate context-specific fields
        if (data.context_type === 'code' && !data.file_path) {
            return res.status(400).json({ error: 'file_path required for code comments' });
        }
        if (data.context_type === 'ui' && !data.selector && !data.xpath && !data.coordinates) {
            return res.status(400).json({
                error: 'selector, xpath, or coordinates required for UI comments',
            });
        }
        // Create thread
        const threadResult = await (0, db_1.query)(`INSERT INTO threads (
          repo, branch, commit_hash, context_type,
          file_path, line_start, line_end, code_snippet,
          selector, xpath, coordinates, screenshot_url,
          priority, tags, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`, [
            data.repo,
            data.branch,
            data.commit_hash || null,
            data.context_type,
            data.file_path || null,
            data.line_start || null,
            data.line_end || null,
            data.code_snippet || null,
            data.selector || null,
            data.xpath || null,
            data.coordinates ? JSON.stringify(data.coordinates) : null,
            data.screenshot_url || null,
            data.priority || 'normal',
            data.tags || [],
            authReq.user.id,
        ]);
        const thread = threadResult.rows[0];
        // Create initial message
        await (0, db_1.query)(`INSERT INTO messages (thread_id, author_id, content)
         VALUES ($1, $2, $3)`, [thread.id, authReq.user.id, data.message]);
        // Log audit event
        await (0, db_1.query)(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`, [
            authReq.user.id,
            'thread.created',
            'thread',
            thread.id,
            JSON.stringify({ repo: data.repo, branch: data.branch, context_type: data.context_type }),
            req.ip,
        ]);
        logger_1.logger.info('Thread created', {
            threadId: thread.id,
            repo: data.repo,
            userId: authReq.user.id,
        });
        res.status(201).json(thread);
    }
    catch (error) {
        logger_1.logger.error('Error creating thread', error);
        res.status(500).json({ error: 'Failed to create thread' });
    }
});
// Get threads with filters
router.get('/', auth_1.authenticate, [
    (0, express_validator_1.query)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.query)('branch').optional(),
    (0, express_validator_1.query)('status').optional().isIn(['open', 'resolved']),
    (0, express_validator_1.query)('context_type').optional().isIn(['code', 'ui']),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { repo, branch, status, context_type } = req.query;
    try {
        let queryText = 'SELECT * FROM thread_summary WHERE repo = $1';
        const params = [repo];
        let paramIndex = 2;
        if (branch) {
            queryText += ` AND branch = $${paramIndex}`;
            params.push(branch);
            paramIndex++;
        }
        if (status) {
            queryText += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (context_type) {
            queryText += ` AND context_type = $${paramIndex}`;
            params.push(context_type);
            paramIndex++;
        }
        queryText += ' ORDER BY created_at DESC';
        const result = await (0, db_1.query)(queryText, params);
        res.json(result.rows);
    }
    catch (error) {
        logger_1.logger.error('Error fetching threads', error);
        res.status(500).json({ error: 'Failed to fetch threads' });
    }
});
// Get a single thread with messages
router.get('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    try {
        // Get thread
        const threadResult = await (0, db_1.query)('SELECT * FROM thread_summary WHERE id = $1', [id]);
        if (threadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Thread not found' });
        }
        const thread = threadResult.rows[0];
        // Get messages with author info
        const messagesResult = await (0, db_1.query)(`SELECT
        m.*,
        u.name as author_name,
        u.email as author_email,
        u.avatar_url as author_avatar
       FROM messages m
       JOIN users u ON m.author_id = u.id
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC`, [id]);
        res.json({
            ...thread,
            messages: messagesResult.rows,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching thread', error);
        res.status(500).json({ error: 'Failed to fetch thread' });
    }
});
// Update thread (resolve, reopen, change priority)
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('write'), [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid thread ID'),
    (0, express_validator_1.body)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.body)('status').optional().isIn(['open', 'resolved']),
    (0, express_validator_1.body)('priority').optional().isIn(['low', 'normal', 'high', 'critical']),
    (0, express_validator_1.body)('tags').optional().isArray(),
    (0, express_validator_1.body)('coordinates').optional().isObject(),
    (0, express_validator_1.body)('selector').optional().isString(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        logger_1.logger.error('Thread update validation failed', { errors: errors.array(), body: req.body });
        return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const authReq = req;
    const updates = req.body;
    try {
        const setClauses = [];
        const params = [];
        let paramIndex = 1;
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramIndex}`);
            params.push(updates.status);
            paramIndex++;
            if (updates.status === 'resolved') {
                setClauses.push(`resolved_by = $${paramIndex}, resolved_at = NOW()`);
                params.push(authReq.user.id);
                paramIndex++;
            }
            else {
                setClauses.push('resolved_by = NULL, resolved_at = NULL');
            }
        }
        if (updates.priority !== undefined) {
            setClauses.push(`priority = $${paramIndex}`);
            params.push(updates.priority);
            paramIndex++;
        }
        if (updates.tags !== undefined) {
            setClauses.push(`tags = $${paramIndex}`);
            params.push(updates.tags);
            paramIndex++;
        }
        if (updates.coordinates !== undefined) {
            setClauses.push(`coordinates = $${paramIndex}`);
            params.push(JSON.stringify(updates.coordinates));
            paramIndex++;
        }
        if (updates.selector !== undefined) {
            setClauses.push(`selector = $${paramIndex}`);
            params.push(updates.selector);
            paramIndex++;
        }
        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid updates provided' });
        }
        params.push(id);
        const queryText = `
        UPDATE threads
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
        const result = await (0, db_1.query)(queryText, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Thread not found' });
        }
        // Log audit event
        await (0, db_1.query)(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`, [
            authReq.user.id,
            'thread.updated',
            'thread',
            id,
            JSON.stringify(updates),
        ]);
        logger_1.logger.info('Thread updated', { threadId: id, updates });
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error updating thread', error);
        res.status(500).json({ error: 'Failed to update thread' });
    }
});
// Delete thread
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    const { id } = req.params;
    const authReq = req;
    try {
        const result = await (0, db_1.query)('DELETE FROM threads WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Thread not found' });
        }
        // Log audit event
        await (0, db_1.query)(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4)`, [authReq.user.id, 'thread.deleted', 'thread', id]);
        logger_1.logger.info('Thread deleted', { threadId: id, userId: authReq.user.id });
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Error deleting thread', error);
        res.status(500).json({ error: 'Failed to delete thread' });
    }
});
exports.default = router;
//# sourceMappingURL=threads.js.map