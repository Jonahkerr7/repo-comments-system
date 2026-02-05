import { Router, Request, Response, NextFunction } from 'express';
import { body, query as validateQuery, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import { AuthenticatedRequest } from '../types';
import { logger } from '../logger';

const router = Router();

/**
 * Middleware to verify webhook authentication.
 * In production, requires X-API-Key header matching WEBHOOK_SECRET.
 * In development, allows unauthenticated requests if no secret is set.
 */
function verifyWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // In development without WEBHOOK_SECRET, allow unauthenticated
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('WEBHOOK_SECRET not configured in production');
      res.status(500).json({ error: 'Webhook not configured' });
      return;
    }
    return next();
  }

  // Validate API key
  if (!apiKey || apiKey !== webhookSecret) {
    logger.warn('Webhook authentication failed', { ip: req.ip });
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  next();
}

// Get all deployments (with filters)
router.get('/', authenticate, async (req, res) => {
  const { repo, branch, status, environment, phase, limit = '20', offset = '0' } = req.query;

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
    const params: any[] = [];
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

    if (phase) {
      queryText += ` AND d.phase = $${paramIndex}`;
      params.push(phase);
      paramIndex++;
    }

    queryText += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching deployments', error);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

// Get a single deployment with activity
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const deploymentResult = await query(
      `SELECT d.*, u.name as created_by_name, r.name as reviewed_by_name
       FROM deployments d
       LEFT JOIN users u ON d.created_by = u.id
       LEFT JOIN users r ON d.reviewed_by = r.id
       WHERE d.id = $1`,
      [id]
    );

    if (deploymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const deployment = deploymentResult.rows[0];

    // Get recent activity
    const activityResult = await query(
      `SELECT da.*, u.name as user_name
       FROM deployment_activity da
       LEFT JOIN users u ON da.user_id = u.id
       WHERE da.deployment_id = $1
       ORDER BY da.created_at DESC
       LIMIT 20`,
      [id]
    );

    deployment.activity = activityResult.rows;

    // Get related threads
    const threadsResult = await query(
      `SELECT id, status, priority, context_type, file_path, selector, created_at
       FROM threads
       WHERE repo = $1 AND branch = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [deployment.repo, deployment.branch]
    );

    deployment.threads = threadsResult.rows;

    res.json(deployment);
  } catch (error) {
    logger.error('Error fetching deployment', error);
    res.status(500).json({ error: 'Failed to fetch deployment' });
  }
});

// Create a new deployment (called by GitHub Actions/webhooks)
router.post(
  '/',
  verifyWebhookAuth,
  [
    body('repo').notEmpty().withMessage('Repository is required'),
    body('branch').notEmpty().withMessage('Branch is required'),
    body('url').notEmpty().isURL().withMessage('Valid URL is required'),
    body('commit_sha').optional().isString(),
    body('commit_message').optional().isString(),
    body('environment').optional().isIn(['preview', 'staging', 'production']),
    body('provider').optional().isString(),
    body('pr_number').optional().isInt(),
    body('pr_title').optional().isString(),
    body('pr_author').optional().isString(),
    body('metadata').optional().isObject(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      repo, branch, url, commit_sha, commit_message,
      environment, provider, pr_number, pr_title, pr_author, metadata
    } = req.body;

    try {
      // Upsert: update if same repo/branch/commit exists
      const result = await query(
        `INSERT INTO deployments (
          repo, branch, url, commit_sha, commit_message,
          environment, provider, pr_number, pr_title, pr_author, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (repo, branch, commit_sha)
        DO UPDATE SET
          url = EXCLUDED.url,
          environment = EXCLUDED.environment,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *`,
        [
          repo, branch, url, commit_sha || null, commit_message || null,
          environment || 'preview', provider || null,
          pr_number || null, pr_title || null, pr_author || null,
          metadata || {}
        ]
      );

      const deployment = result.rows[0];

      // Also create/update the URL mapping
      await query(
        `INSERT INTO repo_urls (repo, url_pattern, environment, branch, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (url_pattern) DO UPDATE SET
           branch = EXCLUDED.branch,
           updated_at = NOW()`,
        [repo, url, environment || 'preview', branch, `${pr_title || branch} deployment`]
      );

      logger.info('Deployment created/updated', { id: deployment.id, repo, branch, url });
      res.status(201).json(deployment);
    } catch (error) {
      logger.error('Error creating deployment', error);
      res.status(500).json({ error: 'Failed to create deployment' });
    }
  }
);

// Update deployment status or phase
router.patch(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('status').optional().isIn(['pending', 'building', 'deployed', 'reviewed', 'approved', 'closed']),
    body('review_status').optional().isIn(['pending', 'in_review', 'changes_requested', 'approved']),
    body('phase').optional().isIn(['discover', 'define', 'develop', 'deliver']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;
    const updates = req.body;

    try {
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
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
          params.push(authReq.user!.id);
          paramIndex++;
        }
      }

      if (updates.review_status !== undefined) {
        setClauses.push(`review_status = $${paramIndex}`);
        params.push(updates.review_status);
        paramIndex++;
      }

      if (updates.phase !== undefined) {
        setClauses.push(`phase = $${paramIndex}`);
        params.push(updates.phase);
        paramIndex++;
        setClauses.push(`phase_changed_at = NOW()`);
        setClauses.push(`phase_changed_by = $${paramIndex}`);
        params.push(authReq.user!.id);
        paramIndex++;
      }

      params.push(id);
      const result = await query(
        `UPDATE deployments SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deployment not found' });
      }

      // Log activity
      const action = updates.phase !== undefined ? 'phase_changed' : 'status_changed';
      await query(
        `INSERT INTO deployment_activity (deployment_id, user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [id, authReq.user!.id, action, JSON.stringify(updates)]
      );

      logger.info('Deployment updated', { id, updates });
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating deployment', error);
      res.status(500).json({ error: 'Failed to update deployment' });
    }
  }
);

// Get threads for a specific deployment
router.get('/:id/threads', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status } = req.query;

  try {
    // First get the deployment to get repo/branch
    const deploymentResult = await query(
      'SELECT repo, branch FROM deployments WHERE id = $1',
      [id]
    );

    if (deploymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const { repo, branch } = deploymentResult.rows[0];

    // Get threads for this repo/branch
    let queryText = `
      SELECT
        t.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as message_count,
        (SELECT content FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at ASC LIMIT 1) as first_message
      FROM threads t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.repo = $1 AND t.branch = $2
    `;
    const params: any[] = [repo, branch];

    if (status) {
      queryText += ' AND t.status = $3';
      params.push(status);
    }

    queryText += ' ORDER BY t.created_at DESC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching deployment threads', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// Log a view (track who's looking at deployments)
router.post('/:id/view', authenticate, async (req, res) => {
  const { id } = req.params;
  const authReq = req as unknown as AuthenticatedRequest;

  try {
    await query(
      `INSERT INTO deployment_activity (deployment_id, user_id, action)
       VALUES ($1, $2, 'viewed')`,
      [id, authReq.user!.id]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error logging deployment view', error);
    res.status(500).json({ error: 'Failed to log view' });
  }
});

// Get deployment stats for dashboard
router.get('/stats/summary', authenticate, async (req, res) => {
  const { repo } = req.query;

  try {
    let whereClause = '';
    const params: any[] = [];

    if (repo) {
      whereClause = 'WHERE repo = $1';
      params.push(repo);
    }

    const result = await query(
      `SELECT
        COUNT(*) as total_deployments,
        COUNT(*) FILTER (WHERE status = 'deployed') as active_deployments,
        COUNT(*) FILTER (WHERE review_status = 'pending') as pending_review,
        COUNT(*) FILTER (WHERE review_status = 'approved') as approved,
        SUM(open_threads) as total_open_threads,
        SUM(comment_count) as total_comments
       FROM deployments ${whereClause}`,
      params
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching deployment stats', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get kanban stats (counts per phase for Double Diamond board)
router.get('/stats/kanban', authenticate, async (req, res) => {
  const { repo } = req.query;

  try {
    let whereClause = "WHERE status != 'closed'";
    const params: any[] = [];

    if (repo) {
      whereClause += ' AND repo = $1';
      params.push(repo);
    }

    const result = await query(
      `SELECT
        COALESCE(phase, 'discover') as phase,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE review_status = 'pending') as pending_review,
        COALESCE(SUM(open_threads), 0) as open_threads
       FROM deployments
       ${whereClause}
       GROUP BY phase`,
      params
    );

    // Return structured data for all phases
    const phases = ['discover', 'define', 'develop', 'deliver'];
    const stats: Record<string, { count: number; pending_review: number; open_threads: number }> = {};

    phases.forEach(p => {
      const row = result.rows.find((r: any) => r.phase === p);
      stats[p] = {
        count: row ? parseInt(row.count) : 0,
        pending_review: row ? parseInt(row.pending_review) : 0,
        open_threads: row ? parseInt(row.open_threads) : 0
      };
    });

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching kanban stats', error);
    res.status(500).json({ error: 'Failed to fetch kanban stats' });
  }
});

export default router;
