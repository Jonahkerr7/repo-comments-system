-- Migration: Deployments/Iterations tracking
-- Track each deployment from GitHub/CI for collaboration

CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Repository info
  repo VARCHAR(255) NOT NULL,               -- e.g., "acme-corp/design-system"
  branch VARCHAR(255) NOT NULL,             -- e.g., "feature/new-button"
  commit_sha VARCHAR(40),                   -- Git commit SHA
  commit_message TEXT,                      -- Commit message for context

  -- Deployment info
  url VARCHAR(500) NOT NULL,                -- Preview URL
  environment VARCHAR(50) DEFAULT 'preview', -- preview, staging, production
  provider VARCHAR(50),                      -- vercel, netlify, github-pages, custom

  -- Pull Request info (if applicable)
  pr_number INTEGER,                        -- PR #123
  pr_title TEXT,                            -- "Add new button component"
  pr_author VARCHAR(255),                   -- GitHub username

  -- Status tracking
  status VARCHAR(50) DEFAULT 'deployed',    -- pending, building, deployed, reviewed, approved, closed
  review_status VARCHAR(50) DEFAULT 'pending', -- pending, in_review, changes_requested, approved

  -- Collaboration stats (denormalized for quick access)
  comment_count INTEGER DEFAULT 0,
  open_threads INTEGER DEFAULT 0,
  resolved_threads INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',              -- Additional data from CI
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deployed_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  closed_at TIMESTAMP,

  -- Who created/reviewed
  created_by UUID REFERENCES users(id),      -- Usually null (created by webhook)
  reviewed_by UUID REFERENCES users(id),

  UNIQUE(repo, branch, commit_sha)           -- One deployment per commit
);

-- Indexes for common queries
CREATE INDEX idx_deployments_repo ON deployments(repo);
CREATE INDEX idx_deployments_branch ON deployments(repo, branch);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_pr ON deployments(repo, pr_number) WHERE pr_number IS NOT NULL;
CREATE INDEX idx_deployments_created ON deployments(created_at DESC);

-- Deployment activity log
CREATE TABLE IF NOT EXISTS deployment_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,              -- created, viewed, commented, approved, closed
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_activity ON deployment_activity(deployment_id, created_at DESC);

-- Automatically update thread counts when comments change
CREATE OR REPLACE FUNCTION update_deployment_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the deployment stats based on threads
  UPDATE deployments d
  SET
    comment_count = (
      SELECT COUNT(*) FROM messages m
      JOIN threads t ON m.thread_id = t.id
      WHERE t.repo = d.repo AND t.branch = d.branch
    ),
    open_threads = (
      SELECT COUNT(*) FROM threads t
      WHERE t.repo = d.repo AND t.branch = d.branch AND t.status = 'open'
    ),
    resolved_threads = (
      SELECT COUNT(*) FROM threads t
      WHERE t.repo = d.repo AND t.branch = d.branch AND t.status = 'resolved'
    ),
    updated_at = NOW()
  WHERE d.repo = NEW.repo AND d.branch = NEW.branch;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comments on table
COMMENT ON TABLE deployments IS 'Tracks each deployment/iteration for collaboration';
COMMENT ON COLUMN deployments.status IS 'Deployment lifecycle: pending, building, deployed, reviewed, approved, closed';
COMMENT ON COLUMN deployments.review_status IS 'Review state: pending, in_review, changes_requested, approved';
