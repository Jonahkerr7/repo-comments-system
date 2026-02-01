import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import { logger } from '../logger';

const router = Router();

// Get all users
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
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
       ORDER BY u.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching users', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get a single user
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await query(
      `SELECT
        u.id,
        u.email,
        u.name,
        u.provider,
        u.avatar_url,
        u.created_at
       FROM users u
       WHERE u.id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get teams
    const teamsResult = await query(
      `SELECT t.id, t.name, tm.role
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1`,
      [id]
    );

    user.teams = teamsResult.rows;

    // Get permissions
    const permsResult = await query(
      `SELECT repo, role
       FROM permissions
       WHERE user_id = $1`,
      [id]
    );

    user.permissions = permsResult.rows;

    res.json(user);
  } catch (error) {
    logger.error('Error fetching user', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update a user (limited fields)
router.patch('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const result = await query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('User updated', { userId: id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating user', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

export default router;
