-- Migration: Add URL-to-Repository mapping table
-- This allows admins to configure which URLs/domains map to which repositories

CREATE TABLE IF NOT EXISTS repo_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,                    -- e.g., "acme-corp/design-system"
  url_pattern VARCHAR(500) NOT NULL,             -- e.g., "https://staging.acme.com/*"
  environment VARCHAR(50) DEFAULT 'development', -- development, staging, production
  branch VARCHAR(255),                           -- optional: auto-select branch for this URL
  description TEXT,                              -- optional description
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(url_pattern)  -- Each URL pattern can only map to one repo
);

-- Index for faster lookups
CREATE INDEX idx_repo_urls_repo ON repo_urls(repo);
CREATE INDEX idx_repo_urls_active ON repo_urls(is_active) WHERE is_active = true;

-- Add some example mappings
INSERT INTO repo_urls (repo, url_pattern, environment, description) VALUES
  ('acme-corp/design-system', 'http://localhost:8080/*', 'development', 'Local development server'),
  ('acme-corp/design-system', 'https://staging.acme.com/*', 'staging', 'Staging environment'),
  ('acme-corp/design-system', 'https://preview-*.vercel.app/*', 'staging', 'Vercel preview deployments')
ON CONFLICT (url_pattern) DO NOTHING;

-- Comment on table
COMMENT ON TABLE repo_urls IS 'Maps URL patterns to repositories for automatic repo detection';
COMMENT ON COLUMN repo_urls.url_pattern IS 'Glob pattern to match URLs. Use * as wildcard.';
