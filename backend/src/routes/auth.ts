import { Router } from 'express';
import passport from '../auth/config';
import { generateToken } from '../auth/config';
import { User, AuthenticatedRequest } from '../types';
import { authenticate } from '../middleware/auth';

const router = Router();

// GitHub OAuth
router.get('/github', (req, res, next) => {
  // Pass through the state parameter to preserve redirect URL
  const state = req.query.state as string;
  passport.authenticate('github', {
    session: false,
    state: state || undefined
  })(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as User;
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // Set cookie for browser-based clients
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Detect which frontend to redirect to based on state parameter
    const state = req.query.state as string;
    let redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Check if state contains a redirect URL
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (stateData.redirect_uri) {
          redirectUrl = stateData.redirect_uri;
        }
      } catch (e) {
        // Invalid state, use default
      }
    }

    // Redirect to frontend with token in query
    // Use & if URL already has query params, otherwise use ?
    const separator = redirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${redirectUrl}${separator}token=${token}`);
  }
);

// Google OAuth
router.get('/google', passport.authenticate('google', {
  session: false,
  scope: ['profile', 'email']
}));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as User;
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/auth/callback?token=${token}`);
  }
);

// Get current user
router.get('/user', authenticate, async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  res.json({
    id: authReq.user!.id,
    email: authReq.user!.email,
    name: authReq.user!.name,
    avatar_url: authReq.user!.avatar_url,
  });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Development login (for testing without OAuth)
router.get('/dev-login', async (req, res) => {
  // Only available in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { query: dbQuery } = await import('../db');

    // Get the first user from the database
    const result = await dbQuery(
      'SELECT * FROM users LIMIT 1'
    );

    let user;
    if (result.rows.length === 0) {
      // Create a dev user if none exists
      const newUser = await dbQuery(
        `INSERT INTO users (email, name, provider, provider_id)
         VALUES ('admin@dev.local', 'Dev Admin', 'dev', 'dev-001')
         RETURNING *`
      );
      user = newUser.rows[0];
    } else {
      user = result.rows[0];
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // Get redirect URL from query or state
    let redirectUrl = (req.query.redirect as string) || 'http://localhost:9000';

    if (req.query.state) {
      try {
        const stateData = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString());
        if (stateData.redirect_uri) {
          redirectUrl = stateData.redirect_uri;
        }
      } catch (e) {
        // Use default
      }
    }

    // Use & if URL already has query params, otherwise use ?
    const separator = redirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${redirectUrl}${separator}token=${token}`);
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

export default router;
