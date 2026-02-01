-- Migration: Add GitHub access token storage
-- This allows fetching user's repos from GitHub API

ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(255);

-- Index for GitHub username lookups
CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username) WHERE github_username IS NOT NULL;

COMMENT ON COLUMN users.github_token IS 'GitHub OAuth access token for API access';
COMMENT ON COLUMN users.github_username IS 'GitHub username for @mentions';
