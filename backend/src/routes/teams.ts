import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import { AuthenticatedRequest } from '../types';
import { logger } from '../logger';

const router = Router();

// Get all teams
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        t.*,
        COUNT(tm.user_id) as member_count
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       GROUP BY t.id
       ORDER BY t.name ASC`
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching teams', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get a single team
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query('SELECT * FROM teams WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching team', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Create a new team
router.post(
  '/',
  authenticate,
  [
    body('name').notEmpty().withMessage('Team name is required'),
    body('org').notEmpty().withMessage('Organization is required'),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, org, description } = req.body;

    try {
      const result = await query(
        `INSERT INTO teams (name, org, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, org, description || null]
      );

      logger.info('Team created', { teamId: result.rows[0].id, name });
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation
        return res.status(400).json({ error: 'Team name already exists in this organization' });
      }
      logger.error('Error creating team', error);
      res.status(500).json({ error: 'Failed to create team' });
    }
  }
);

// Update a team
router.patch(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description } = req.body;

    try {
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }

      if (description !== undefined) {
        setClauses.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      params.push(id);
      const result = await query(
        `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      logger.info('Team updated', { teamId: id });
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating team', error);
      res.status(500).json({ error: 'Failed to update team' });
    }
  }
);

// Delete a team
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query('DELETE FROM teams WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    logger.info('Team deleted', { teamId: id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting team', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Get team members
router.get('/:id/members', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        tm.role
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY u.name ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching team members', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Add a team member
router.post(
  '/:id/members',
  authenticate,
  [
    param('id').isUUID(),
    body('user_id').isUUID().withMessage('Valid user ID is required'),
    body('role').isIn(['member', 'admin']).withMessage('Role must be member or admin'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { user_id, role } = req.body;

    try {
      const result = await query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, user_id, role]
      );

      logger.info('Team member added', { teamId: id, userId: user_id, role });
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'User is already a member of this team' });
      }
      logger.error('Error adding team member', error);
      res.status(500).json({ error: 'Failed to add team member' });
    }
  }
);

// Remove a team member
router.delete('/:teamId/members/:userId', authenticate, async (req, res) => {
  const { teamId, userId } = req.params;

  try {
    const result = await query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING *',
      [teamId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    logger.info('Team member removed', { teamId, userId });
    res.status(204).send();
  } catch (error) {
    logger.error('Error removing team member', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
