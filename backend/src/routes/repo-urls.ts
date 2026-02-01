import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import { AuthenticatedRequest } from '../types';
import { logger } from '../logger';

const router = Router();

// Get all repo URL mappings
router.get('/', authenticate, async (req, res) => {
  const { repo } = req.query;

  try {
    let queryText = `
      SELECT ru.*, u.name as created_by_name
      FROM repo_urls ru
      LEFT JOIN users u ON ru.created_by = u.id
      WHERE ru.is_active = true
    `;
    const params: any[] = [];

    if (repo) {
      queryText += ' AND ru.repo = $1';
      params.push(repo);
    }

    queryText += ' ORDER BY ru.repo, ru.environment, ru.created_at';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching repo URLs', error);
    res.status(500).json({ error: 'Failed to fetch repo URLs' });
  }
});

// Get repo for a specific URL (used by Chrome extension)
router.get('/lookup', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Get all active URL patterns
    const result = await query(
      'SELECT repo, url_pattern, branch, environment FROM repo_urls WHERE is_active = true'
    );

    // Find matching pattern
    for (const row of result.rows) {
      if (matchUrlPattern(url as string, row.url_pattern)) {
        return res.json({
          repo: row.repo,
          branch: row.branch,
          environment: row.environment,
          matched_pattern: row.url_pattern,
        });
      }
    }

    // No match found
    res.status(404).json({ error: 'No repository configured for this URL' });
  } catch (error) {
    logger.error('Error looking up repo for URL', error);
    res.status(500).json({ error: 'Failed to lookup repo' });
  }
});

// Create a new URL mapping
router.post(
  '/',
  authenticate,
  [
    body('repo').notEmpty().withMessage('Repository is required'),
    body('url_pattern').notEmpty().withMessage('URL pattern is required'),
    body('environment').optional().isIn(['development', 'staging', 'production']),
    body('branch').optional().isString(),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const authReq = req as AuthenticatedRequest;
    const { repo, url_pattern, environment, branch, description } = req.body;

    try {
      const result = await query(
        `INSERT INTO repo_urls (repo, url_pattern, environment, branch, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [repo, url_pattern, environment || 'development', branch || null, description || null, authReq.user!.id]
      );

      logger.info('Repo URL mapping created', { repo, url_pattern });
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'URL pattern already exists' });
      }
      logger.error('Error creating repo URL mapping', error);
      res.status(500).json({ error: 'Failed to create repo URL mapping' });
    }
  }
);

// Update a URL mapping
router.patch(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('url_pattern').optional().notEmpty(),
    body('environment').optional().isIn(['development', 'staging', 'production']),
    body('branch').optional().isString(),
    body('description').optional().isString(),
    body('is_active').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;

    try {
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      const allowedFields = ['url_pattern', 'environment', 'branch', 'description', 'is_active'];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(updates[field]);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      setClauses.push(`updated_at = NOW()`);
      params.push(id);

      const result = await query(
        `UPDATE repo_urls SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'URL mapping not found' });
      }

      logger.info('Repo URL mapping updated', { id });
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating repo URL mapping', error);
      res.status(500).json({ error: 'Failed to update repo URL mapping' });
    }
  }
);

// Delete a URL mapping
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query('DELETE FROM repo_urls WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'URL mapping not found' });
    }

    logger.info('Repo URL mapping deleted', { id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting repo URL mapping', error);
    res.status(500).json({ error: 'Failed to delete repo URL mapping' });
  }
});

// Helper function to match URL against pattern
function matchUrlPattern(url: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // * matches any characters except /
  // ** matches any characters including /
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')     // Temporary placeholder
    .replace(/\*/g, '[^/]*')                  // * matches non-slash
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');  // ** matches anything

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

export default router;
