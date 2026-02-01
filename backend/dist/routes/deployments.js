"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
// Get all deployments (with filters)
router.get('/', auth_1.authenticate, async (req, res) => {
    const { repo, branch, status, environment, limit = '20', offset = '0' } = req.query;
    try {
        let queryText = `
      SELECT
        d.*,
        u.name as created_by_name,
        r.name as reviewed_by_name
      FROM deployments d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users r ON d.reviewed_by = r.id
      WHERE 1=1
    `;
        const params = [];
        let paramIndex = 1;
        if (repo) {
            queryText += ` AND d.repo = $${paramIndex}`;
            params.push(repo);
            paramIndex++;
        }
        if (branch) {
            queryText += ` AND d.branch = $${paramIndex}`;
            params.push(branch);
            paramIndex++;
        }
        if (status) {
            queryText += ` AND d.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (environment) {
            queryText += ` AND d.environment = $${paramIndex}`;
            params.push(environment);
            paramIndex++;
        }
        queryText += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        const result = await (0, db_1.query)(queryText, params);
        res.json(result.rows);
    }
    catch (error) {
        logger_1.logger.error('Error fetching deployments', error);
        res.status(500).json({ error: 'Failed to fetch deployments' });
    }
});
// Get a single deployment with activity
router.get('/:id', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    try {
        const deploymentResult = await (0, db_1.query)(`SELECT d.*, u.name as created_by_name, r.name as reviewed_by_name
       FROM deployments d
       LEFT JOIN users u ON d.created_by = u.id
       LEFT JOIN users r ON d.reviewed_by = r.id
       WHERE d.id = $1`, [id]);
        if (deploymentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        const deployment = deploymentResult.rows[0];
        // Get recent activity
        const activityResult = await (0, db_1.query)(`SELECT da.*, u.name as user_name
       FROM deployment_activity da
       LEFT JOIN users u ON da.user_id = u.id
       WHERE da.deployment_id = $1
       ORDER BY da.created_at DESC
       LIMIT 20`, [id]);
        deployment.activity = activityResult.rows;
        // Get related threads
        const threadsResult = await (0, db_1.query)(`SELECT id, status, priority, context_type, file_path, selector, created_at
       FROM threads
       WHERE repo = $1 AND branch = $2
       ORDER BY created_at DESC
       LIMIT 10`, [deployment.repo, deployment.branch]);
        deployment.threads = threadsResult.rows;
        res.json(deployment);
    }
    catch (error) {
        logger_1.logger.error('Error fetching deployment', error);
        res.status(500).json({ error: 'Failed to fetch deployment' });
    }
});
// Create a new deployment (called by GitHub Actions/webhooks)
router.post('/', 
// No auth required for webhooks - use API key instead
[
    (0, express_validator_1.body)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.body)('branch').notEmpty().withMessage('Branch is required'),
    (0, express_validator_1.body)('url').notEmpty().isURL().withMessage('Valid URL is required'),
    (0, express_validator_1.body)('commit_sha').optional().isString(),
    (0, express_validator_1.body)('commit_message').optional().isString(),
    (0, express_validator_1.body)('environment').optional().isIn(['preview', 'staging', 'production']),
    (0, express_validator_1.body)('provider').optional().isString(),
    (0, express_validator_1.body)('pr_number').optional().isInt(),
    (0, express_validator_1.body)('pr_title').optional().isString(),
    (0, express_validator_1.body)('pr_author').optional().isString(),
    (0, express_validator_1.body)('metadata').optional().isObject(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { repo, branch, url, commit_sha, commit_message, environment, provider, pr_number, pr_title, pr_author, metadata } = req.body;
    try {
        // Upsert: update if same repo/branch/commit exists
        const result = await (0, db_1.query)(`INSERT INTO deployments (
          repo, branch, url, commit_sha, commit_message,
          environment, provider, pr_number, pr_title, pr_author, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (repo, branch, commit_sha)
        DO UPDATE SET
          url = EXCLUDED.url,
          environment = EXCLUDED.environment,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *`, [
            repo, branch, url, commit_sha || null, commit_message || null,
            environment || 'preview', provider || null,
            pr_number || null, pr_title || null, pr_author || null,
            metadata || {}
        ]);
        const deployment = result.rows[0];
        // Also create/update the URL mapping
        await (0, db_1.query)(`INSERT INTO repo_urls (repo, url_pattern, environment, branch, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (url_pattern) DO UPDATE SET
           branch = EXCLUDED.branch,
           updated_at = NOW()`, [repo, url, environment || 'preview', branch, `${pr_title || branch} deployment`]);
        logger_1.logger.info('Deployment created/updated', { id: deployment.id, repo, branch, url });
        res.status(201).json(deployment);
    }
    catch (error) {
        logger_1.logger.error('Error creating deployment', error);
        res.status(500).json({ error: 'Failed to create deployment' });
    }
});
// Update deployment status
router.patch('/:id', auth_1.authenticate, [
    (0, express_validator_1.param)('id').isUUID(),
    (0, express_validator_1.body)('status').optional().isIn(['pending', 'building', 'deployed', 'reviewed', 'approved', 'closed']),
    (0, express_validator_1.body)('review_status').optional().isIn(['pending', 'in_review', 'changes_requested', 'approved']),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const authReq = req;
    const updates = req.body;
    try {
        const setClauses = ['updated_at = NOW()'];
        const params = [];
        let paramIndex = 1;
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramIndex}`);
            params.push(updates.status);
            paramIndex++;
            if (updates.status === 'closed') {
                setClauses.push(`closed_at = NOW()`);
            }
            if (updates.status === 'reviewed' || updates.status === 'approved') {
                setClauses.push(`reviewed_at = NOW()`);
                setClauses.push(`reviewed_by = $${paramIndex}`);
                params.push(authReq.user.id);
                paramIndex++;
            }
        }
        if (updates.review_status !== undefined) {
            setClauses.push(`review_status = $${paramIndex}`);
            params.push(updates.review_status);
            paramIndex++;
        }
        params.push(id);
        const result = await (0, db_1.query)(`UPDATE deployments SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        // Log activity
        await (0, db_1.query)(`INSERT INTO deployment_activity (deployment_id, user_id, action, details)
         VALUES ($1, $2, $3, $4)`, [id, authReq.user.id, 'status_changed', JSON.stringify(updates)]);
        logger_1.logger.info('Deployment updated', { id, updates });
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error updating deployment', error);
        res.status(500).json({ error: 'Failed to update deployment' });
    }
});
// Log a view (track who's looking at deployments)
router.post('/:id/view', auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    const authReq = req;
    try {
        await (0, db_1.query)(`INSERT INTO deployment_activity (deployment_id, user_id, action)
       VALUES ($1, $2, 'viewed')`, [id, authReq.user.id]);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Error logging deployment view', error);
        res.status(500).json({ error: 'Failed to log view' });
    }
});
// Get deployment stats for dashboard
router.get('/stats/summary', auth_1.authenticate, async (req, res) => {
    const { repo } = req.query;
    try {
        let whereClause = '';
        const params = [];
        if (repo) {
            whereClause = 'WHERE repo = $1';
            params.push(repo);
        }
        const result = await (0, db_1.query)(`SELECT
        COUNT(*) as total_deployments,
        COUNT(*) FILTER (WHERE status = 'deployed') as active_deployments,
        COUNT(*) FILTER (WHERE review_status = 'pending') as pending_review,
        COUNT(*) FILTER (WHERE review_status = 'approved') as approved,
        SUM(open_threads) as total_open_threads,
        SUM(comment_count) as total_comments
       FROM deployments ${whereClause}`, params);
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error fetching deployment stats', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
exports.default = router;
//# sourceMappingURL=deployments.js.map