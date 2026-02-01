import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import { AuthenticatedRequest } from '../types';
import { logger } from '../logger';

const router = Router();

// Get user's GitHub repositories
router.get('/repos', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;

  try {
    // Get user's GitHub token
    const userResult = await query(
      'SELECT github_token, github_username FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].github_token) {
      return res.status(400).json({
        error: 'GitHub not connected',
        message: 'Please login with GitHub to access your repositories'
      });
    }

    const { github_token } = userResult.rows[0];

    // Fetch repos from GitHub API - owner affiliation shows only repos user owns
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
      headers: {
        'Authorization': `Bearer ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoComments'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          error: 'GitHub token expired',
          message: 'Please re-login with GitHub to refresh your access'
        });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json() as any[];

    // Return simplified repo info
    const simplifiedRepos = repos.map((repo: any) => ({
      id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
      language: repo.language,
    }));

    res.json(simplifiedRepos);
  } catch (error) {
    logger.error('Error fetching GitHub repos', error);
    res.status(500).json({ error: 'Failed to fetch GitHub repositories' });
  }
});

// Get branches for a specific repo
router.get('/repos/:owner/:repo/branches', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { owner, repo } = req.params;

  try {
    const userResult = await query(
      'SELECT github_token FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].github_token) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const { github_token } = userResult.rows[0];

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${github_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoComments'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const branches = await response.json() as any[];

    res.json(branches.map((b: any) => ({
      name: b.name,
      protected: b.protected
    })));
  } catch (error) {
    logger.error('Error fetching branches', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Quick connect a repo (creates permission entry)
router.post('/connect', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { repo, default_role = 'write' } = req.body;

  if (!repo) {
    return res.status(400).json({ error: 'Repository name is required' });
  }

  try {
    // Check if permission already exists for this user/repo
    const existing = await query(
      'SELECT id FROM permissions WHERE user_id = $1 AND repo = $2',
      [authReq.user!.id, repo]
    );

    if (existing.rows.length > 0) {
      return res.json({ message: 'Repository already connected', id: existing.rows[0].id });
    }

    // Create permission for this user
    const result = await query(
      `INSERT INTO permissions (user_id, repo, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [authReq.user!.id, repo, default_role]
    );

    logger.info('Repository connected', { repo, userId: authReq.user!.id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error connecting repository', error);
    res.status(500).json({ error: 'Failed to connect repository' });
  }
});

export default router;
