import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { User, JWTPayload } from '../types';
import { logger } from '../logger';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

async function findOrCreateUser(
  email: string,
  name: string,
  provider: string,
  providerId: string,
  avatarUrl?: string,
  githubToken?: string,
  githubUsername?: string
): Promise<User> {
  // Try to find existing user
  const existingUser = await query<User>(
    'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
    [provider, providerId]
  );

  if (existingUser.rows.length > 0) {
    // Update last login and GitHub token if provided
    if (githubToken) {
      await query(
        'UPDATE users SET last_login = NOW(), github_token = $2, github_username = $3 WHERE id = $1',
        [existingUser.rows[0].id, githubToken, githubUsername]
      );
    } else {
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [existingUser.rows[0].id]
      );
    }
    return existingUser.rows[0];
  }

  // Create new user
  const newUser = await query<User>(
    `INSERT INTO users (email, name, provider, provider_id, avatar_url, github_token, github_username, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [email, name, provider, providerId, avatarUrl || null, githubToken || null, githubUsername || null]
  );

  logger.info('New user created', { email, provider });
  return newUser.rows[0];
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ['user:email', 'repo'],  // repo scope to fetch user's repositories
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
          const user = await findOrCreateUser(
            email,
            profile.displayName || profile.username || 'GitHub User',
            'github',
            profile.id,
            profile.photos?.[0]?.value,
            accessToken,  // Store the GitHub token
            profile.username  // Store the GitHub username
          );
          done(null, user);
        } catch (error) {
          logger.error('GitHub OAuth error', error);
          done(error as Error);
        }
      }
    )
  );
}

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email provided by Google'));
          }

          const user = await findOrCreateUser(
            email,
            profile.displayName || 'Google User',
            'google',
            profile.id,
            profile.photos?.[0]?.value
          );
          done(null, user);
        } catch (error) {
          logger.error('Google OAuth error', error);
          done(error as Error);
        }
      }
    )
  );
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const result = await query<User>('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error);
  }
});

export default passport;
