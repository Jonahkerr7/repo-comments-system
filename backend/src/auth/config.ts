import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db';
import { User, JWTPayload } from '../types';
import { logger } from '../logger';

// JWT Secret - fail in production if not set
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  logger.error('FATAL: JWT_SECRET environment variable must be set in production');
  process.exit(1);
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-secret-not-for-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Token encryption key for GitHub tokens (32 bytes = 64 hex chars)
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

/**
 * Encrypts a token using AES-256-GCM.
 * If no encryption key is configured, returns the token unchanged (for dev).
 */
export function encryptToken(token: string): string {
  if (!TOKEN_ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('TOKEN_ENCRYPTION_KEY not set - GitHub tokens stored unencrypted');
    }
    return token;
  }

  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex'),
      iv
    );
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    logger.error('Token encryption failed', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypts a token that was encrypted with encryptToken.
 * Handles both encrypted (contains ':') and unencrypted tokens.
 */
export function decryptToken(encrypted: string): string {
  if (!TOKEN_ENCRYPTION_KEY || !encrypted.includes(':')) {
    return encrypted;
  }

  try {
    const [ivHex, authTagHex, data] = encrypted.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex'),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('Token decryption failed', error);
    throw new Error('Failed to decrypt token');
  }
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload as object, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, EFFECTIVE_JWT_SECRET) as JWTPayload;
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
  // Encrypt GitHub token if provided
  const encryptedGithubToken = githubToken ? encryptToken(githubToken) : null;

  // Try to find existing user
  const existingUser = await query<User>(
    'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
    [provider, providerId]
  );

  if (existingUser.rows.length > 0) {
    // Update last login and GitHub token if provided
    if (encryptedGithubToken) {
      await query(
        'UPDATE users SET last_login = NOW(), github_token = $2, github_username = $3 WHERE id = $1',
        [existingUser.rows[0].id, encryptedGithubToken, githubUsername]
      );
    } else {
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [existingUser.rows[0].id]
      );
    }
    return existingUser.rows[0];
  }

  // Create new user with encrypted token
  const newUser = await query<User>(
    `INSERT INTO users (email, name, provider, provider_id, avatar_url, github_token, github_username, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [email, name, provider, providerId, avatarUrl || null, encryptedGithubToken, githubUsername || null]
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
