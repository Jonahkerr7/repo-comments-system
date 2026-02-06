import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { decryptToken } from '../auth/config';
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

    const { github_token: encryptedToken } = userResult.rows[0];
    const github_token = decryptToken(encryptedToken);

    // Fetch repos from GitHub API - include owned repos and org member repos
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,organization_member', {
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

    const { github_token: encryptedToken } = userResult.rows[0];
    const github_token = decryptToken(encryptedToken);

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

// Get user's connected repositories (repos with permissions)
router.get('/connected', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;

  try {
    // Get repos the user has connected (has permissions for)
    // Use DISTINCT ON (repo) to return only one row per unique repo (the most recent)
    const permissionsResult = await query(
      `SELECT DISTINCT ON (repo) repo, role, created_at FROM permissions
       WHERE user_id = $1
       ORDER BY repo, created_at DESC`,
      [authReq.user!.id]
    );

    const connectedRepos = permissionsResult.rows;

    // Get URL mappings for these repos (case-insensitive)
    const repoNames = connectedRepos.map(r => r.repo);
    const repoNamesLower = repoNames.map(r => r.toLowerCase());
    let urlMappings: Record<string, any[]> = {};

    if (repoNames.length > 0) {
      const urlsResult = await query(
        `SELECT repo, url_pattern, environment FROM repo_urls
         WHERE LOWER(repo) = ANY($1) AND is_active = true`,
        [repoNamesLower]
      );

      urlsResult.rows.forEach(row => {
        // Map back to the original connected repo name (case-insensitive match)
        const matchingRepo = repoNames.find(r => r.toLowerCase() === row.repo.toLowerCase());
        const key = matchingRepo || row.repo;
        if (!urlMappings[key]) urlMappings[key] = [];
        urlMappings[key].push(row);
      });
    }

    // Get thread counts for these repos (case-insensitive)
    let threadCounts: Record<string, { open: number; resolved: number }> = {};

    if (repoNames.length > 0) {
      const threadsResult = await query(
        `SELECT LOWER(repo) as repo_lower, status, COUNT(*) as count FROM threads
         WHERE LOWER(repo) = ANY($1)
         GROUP BY LOWER(repo), status`,
        [repoNamesLower]
      );

      threadsResult.rows.forEach(row => {
        // Map back to the original connected repo name
        const matchingRepo = repoNames.find(r => r.toLowerCase() === row.repo_lower);
        const key = matchingRepo || row.repo_lower;
        if (!threadCounts[key]) threadCounts[key] = { open: 0, resolved: 0 };
        threadCounts[key][row.status as 'open' | 'resolved'] = parseInt(row.count);
      });
    }

    // Combine data
    const result = connectedRepos.map(r => ({
      repo: r.repo,
      role: r.role,
      connected_at: r.created_at,
      urls: urlMappings[r.repo] || [],
      threads: threadCounts[r.repo] || { open: 0, resolved: 0 }
    }));

    res.json(result);
  } catch (error) {
    logger.error('Error fetching connected repos', error);
    res.status(500).json({ error: 'Failed to fetch connected repositories' });
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

    // Auto-register GitHub Pages URL if applicable
    const [owner, repoName] = repo.split('/');
    if (owner && repoName) {
      const githubPagesUrl = `https://${owner.toLowerCase()}.github.io/${repoName}/*`;
      try {
        await query(
          `INSERT INTO repo_urls (repo, url_pattern, environment, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (url_pattern) DO NOTHING`,
          [repo, githubPagesUrl, 'production', 'Auto-registered GitHub Pages']
        );
        logger.info('Auto-registered GitHub Pages URL', { repo, url: githubPagesUrl });
      } catch (urlError) {
        // Non-critical, just log and continue
        logger.warn('Failed to auto-register GitHub Pages URL', urlError);
      }
    }

    logger.info('Repository connected', { repo, userId: authReq.user!.id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error connecting repository', error);
    res.status(500).json({ error: 'Failed to connect repository' });
  }
});

// Disconnect a repository (remove user's permission)
router.delete('/disconnect/:owner/:repo', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { owner, repo: repoName } = req.params;
  const fullRepo = `${owner}/${repoName}`;

  try {
    // Delete user's permission for this repo
    const result = await query(
      'DELETE FROM permissions WHERE user_id = $1 AND LOWER(repo) = LOWER($2) RETURNING id',
      [authReq.user!.id, fullRepo]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not connected' });
    }

    // Also delete associated repo URLs created by this user
    await query(
      'DELETE FROM repo_urls WHERE LOWER(repo) = LOWER($1) AND created_by = $2',
      [fullRepo, authReq.user!.id]
    );

    logger.info('Repository disconnected', { repo: fullRepo, userId: authReq.user!.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error disconnecting repository', error);
    res.status(500).json({ error: 'Failed to disconnect repository' });
  }
});

export default router;
