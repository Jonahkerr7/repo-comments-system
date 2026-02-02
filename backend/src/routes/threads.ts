import { Router } from 'express';
import { body, query as validateQuery, param, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../db';
import {
  Thread,
  ThreadSummary,
  CreateThreadRequest,
  UpdateThreadRequest,
  AuthenticatedRequest,
} from '../types';
import { logger } from '../logger';

const router = Router();

// Validation middleware
const validateThread = [
  body('repo').notEmpty().withMessage('Repository is required'),
  body('branch').notEmpty().withMessage('Branch is required'),
  body('context_type').isIn(['code', 'ui']).withMessage('Invalid context type'),
  body('message').notEmpty().withMessage('Initial message is required'),
];

// Create a new thread
router.post(
  '/',
  authenticate,
  authorize('write'),
  validateThread,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const authReq = req as unknown as AuthenticatedRequest;
    const data: CreateThreadRequest = req.body;

    // Debug: log screenshot and element data
    logger.info('Thread creation request', {
      hasScreenshot: !!data.screenshot,
      screenshotLength: data.screenshot?.length || 0,
      element_tag: data.element_tag,
      element_text: data.element_text,
    });

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

      // Find the active deployment for this repo/branch
      const deploymentResult = await query(
        `SELECT id FROM deployments
         WHERE repo = $1 AND branch = $2 AND status != 'closed'
         ORDER BY created_at DESC LIMIT 1`,
        [data.repo, data.branch]
      );
      const deploymentId = deploymentResult.rows[0]?.id || null;

      // Handle screenshot - accept base64 data URL or URL
      const screenshotUrl = data.screenshot || data.screenshot_url || null;

      // Create thread with deployment link
      const threadResult = await query<Thread>(
        `INSERT INTO threads (
          repo, branch, commit_hash, context_type,
          file_path, line_start, line_end, code_snippet,
          selector, xpath, coordinates, screenshot_url,
          element_tag, element_text,
          priority, tags, created_by, deployment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
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
          screenshotUrl,
          data.element_tag || null,
          data.element_text || null,
          data.priority || 'normal',
          data.tags || [],
          authReq.user!.id,
          deploymentId,
        ]
      );

      const thread = threadResult.rows[0];

      // Create initial message
      await query(
        `INSERT INTO messages (thread_id, author_id, content)
         VALUES ($1, $2, $3)`,
        [thread.id, authReq.user!.id, data.message]
      );

      // Log audit event
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          authReq.user!.id,
          'thread.created',
          'thread',
          thread.id,
          JSON.stringify({ repo: data.repo, branch: data.branch, context_type: data.context_type }),
          req.ip,
        ]
      );

      logger.info('Thread created', {
        threadId: thread.id,
        repo: data.repo,
        userId: authReq.user!.id,
      });

      res.status(201).json(thread);
    } catch (error) {
      logger.error('Error creating thread', error);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  }
);

// Get threads with filters
router.get(
  '/',
  authenticate,
  [
    validateQuery('repo').optional(),
    validateQuery('branch').optional(),
    validateQuery('status').optional().isIn(['open', 'resolved']),
    validateQuery('context_type').optional().isIn(['code', 'ui']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { repo, branch, status, context_type } = req.query;

    try {
      let queryText = 'SELECT * FROM thread_summary WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (repo) {
        queryText += ` AND repo = $${paramIndex}`;
        params.push(repo);
        paramIndex++;
      }

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

      const result = await query<ThreadSummary>(queryText, params);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching threads', error);
      res.status(500).json({ error: 'Failed to fetch threads' });
    }
  }
);

// Get a single thread with messages
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    // Get thread
    const threadResult = await query<ThreadSummary>(
      'SELECT * FROM thread_summary WHERE id = $1',
      [id]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const thread = threadResult.rows[0];

    // Get messages with author info and reactions
    const messagesResult = await query(
      `SELECT
        m.*,
        u.name as author_name,
        u.email as author_email,
        u.avatar_url as author_avatar,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', r.id,
                'emoji', r.emoji,
                'user_id', r.user_id,
                'user_name', ru.name
              )
            )
            FROM reactions r
            JOIN users ru ON r.user_id = ru.id
            WHERE r.message_id = m.id
          ),
          '[]'::json
        ) as reactions
       FROM messages m
       JOIN users u ON m.author_id = u.id
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    res.json({
      ...thread,
      messages: messagesResult.rows,
    });
  } catch (error) {
    logger.error('Error fetching thread', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Update thread (resolve, reopen, change priority)
router.patch(
  '/:id',
  authenticate,
  authorize('write'),
  [
    param('id').isUUID().withMessage('Invalid thread ID'),
    body('repo').notEmpty().withMessage('Repository is required'),
    body('status').optional().isIn(['open', 'resolved']),
    body('priority').optional().isIn(['low', 'normal', 'high', 'critical']),
    body('tags').optional().isArray(),
    body('coordinates').optional().isObject(),
    body('selector').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Thread update validation failed', { errors: errors.array(), body: req.body });
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;
    const updates: UpdateThreadRequest = req.body;

    try {
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex}`);
        params.push(updates.status);
        paramIndex++;

        if (updates.status === 'resolved') {
          setClauses.push(`resolved_by = $${paramIndex}, resolved_at = NOW()`);
          params.push(authReq.user!.id);
          paramIndex++;
        } else {
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

      const result = await query<Thread>(queryText, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Log audit event
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          authReq.user!.id,
          'thread.updated',
          'thread',
          id,
          JSON.stringify(updates),
        ]
      );

      logger.info('Thread updated', { threadId: id, updates });

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating thread', error);
      res.status(500).json({ error: 'Failed to update thread' });
    }
  }
);

// Delete thread
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const authReq = req as unknown as AuthenticatedRequest;

  try {
    const result = await query('DELETE FROM threads WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Log audit event
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4)`,
      [authReq.user!.id, 'thread.deleted', 'thread', id]
    );

    logger.info('Thread deleted', { threadId: id, userId: authReq.user!.id });

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting thread', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

export default router;
