import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/config';
import { query } from '../db';
import { User, AuthenticatedRequest } from '../types';
import { logger } from '../logger';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.token;

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : cookieToken;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = verifyToken(token);

    // Fetch full user from database
    const result = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [payload.id]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    (req as unknown as AuthenticatedRequest).user = result.rows[0];
    next();
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(requiredRole: 'admin' | 'write' | 'read') {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authReq = req as unknown as AuthenticatedRequest;
    const repo = req.params.repo || req.body.repo || req.query.repo;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!repo) {
      res.status(400).json({ error: 'Repository not specified' });
      return;
    }

    try {
      // Check user permissions for this repo
      const permissions = await query<{ role: string }>(
        `SELECT role FROM user_permissions
         WHERE user_id = $1 AND repo = $2`,
        [authReq.user.id, repo]
      );

      if (permissions.rows.length === 0) {
        res.status(403).json({ error: 'Access denied to this repository' });
        return;
      }

      const userRole = permissions.rows[0].role;

      // Role hierarchy: admin > write > read
      const roleHierarchy = { read: 1, write: 2, admin: 3 };
      const hasPermission =
        roleHierarchy[userRole as keyof typeof roleHierarchy] >=
        roleHierarchy[requiredRole];

      if (!hasPermission) {
        res.status(403).json({
          error: `Insufficient permissions. Required: ${requiredRole}, has: ${userRole}`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization error', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : cookieToken;

  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    query<User>('SELECT * FROM users WHERE id = $1', [payload.id])
      .then((result) => {
        if (result.rows.length > 0) {
          (req as unknown as AuthenticatedRequest).user = result.rows[0];
        }
        next();
      })
      .catch((error) => {
        logger.error('Optional auth error', error);
        next();
      });
  } catch (error) {
    next();
  }
}
