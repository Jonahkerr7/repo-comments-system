-- Repository-Native Commenting System
-- Database Schema v1.0

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  provider VARCHAR(50) NOT NULL,           -- 'github' | 'google' | 'okta'
  provider_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,

  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  UNIQUE(provider, provider_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(provider, provider_id);

-- Teams table (for team-based permissions)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  org VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(org, name)
);

CREATE INDEX idx_teams_org ON teams(org);

-- Team members junction table
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',       -- 'admin' | 'member'
  added_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);

-- Permissions table
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,               -- 'admin' | 'write' | 'read'
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT user_or_team CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  ),
  CONSTRAINT valid_role CHECK (role IN ('admin', 'write', 'read'))
);

CREATE INDEX idx_permissions_repo ON permissions(repo);
CREATE INDEX idx_permissions_user ON permissions(user_id);
CREATE INDEX idx_permissions_team ON permissions(team_id);

-- Comment threads table
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Repository context
  repo VARCHAR(255) NOT NULL,              -- format: 'org/repo-name'
  branch VARCHAR(255) NOT NULL,            -- e.g., 'main', 'feature/xyz'
  commit_hash VARCHAR(40),                 -- optional: specific git commit

  -- Comment context type
  context_type VARCHAR(20) NOT NULL,       -- 'code' | 'ui'

  -- For code comments
  file_path TEXT,
  line_start INT,
  line_end INT,
  code_snippet TEXT,                       -- optional: preserve code context

  -- For UI comments
  selector TEXT,                           -- CSS selector
  xpath TEXT,                              -- alternative: XPath
  coordinates JSONB,                       -- { x: number, y: number, width?, height? }
  screenshot_url TEXT,                     -- S3/storage URL

  -- Thread metadata
  status VARCHAR(20) DEFAULT 'open',       -- 'open' | 'resolved'
  priority VARCHAR(20) DEFAULT 'normal',   -- 'low' | 'normal' | 'high' | 'critical'
  tags TEXT[],                             -- flexible tagging

  -- Audit fields
  created_by UUID NOT NULL REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_context CHECK (
    (context_type = 'code' AND file_path IS NOT NULL) OR
    (context_type = 'ui' AND (selector IS NOT NULL OR xpath IS NOT NULL OR coordinates IS NOT NULL))
  ),
  CONSTRAINT valid_status CHECK (status IN ('open', 'resolved')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT valid_lines CHECK (
    (line_start IS NULL AND line_end IS NULL) OR
    (line_start IS NOT NULL AND line_end IS NOT NULL AND line_start <= line_end)
  )
);

CREATE INDEX idx_threads_repo ON threads(repo, branch);
CREATE INDEX idx_threads_status ON threads(status);
CREATE INDEX idx_threads_created_by ON threads(created_by);
CREATE INDEX idx_threads_context ON threads(context_type, repo, branch);
CREATE INDEX idx_threads_tags ON threads USING GIN(tags);

-- Messages table (for threaded replies)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,

  -- Optional: reply to specific message (nested threads)
  parent_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,

  -- Rich content
  mentions UUID[],                         -- user IDs mentioned in message
  attachments JSONB,                       -- [{ url, type, name }]

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  edited BOOLEAN DEFAULT FALSE,

  CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_author ON messages(author_id);
CREATE INDEX idx_messages_parent ON messages(parent_message_id);

-- Reactions table (optional: emoji reactions)
CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL,              -- e.g., '👍', '❤️', '🎉'
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON reactions(message_id);

-- Notifications table (for @mentions and updates)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,               -- 'mention' | 'reply' | 'resolved' | 'assigned'
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at);
CREATE INDEX idx_notifications_thread ON notifications(thread_id);

-- Webhooks table (for integrations)
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,                  -- ['thread.created', 'thread.resolved', ...]
  secret VARCHAR(255),                     -- for signature verification
  active BOOLEAN DEFAULT TRUE,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_triggered_at TIMESTAMP
);

CREATE INDEX idx_webhooks_repo ON webhooks(repo, active);

-- Audit log table (for tracking changes)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,            -- 'thread.created', 'message.added', 'thread.resolved'
  resource_type VARCHAR(50) NOT NULL,      -- 'thread', 'message', 'user'
  resource_id UUID,
  metadata JSONB,                          -- flexible field for action-specific data
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View: Thread with message count and last activity
CREATE VIEW thread_summary AS
SELECT
  t.*,
  u.name as creator_name,
  u.email as creator_email,
  u.avatar_url as creator_avatar,
  COUNT(DISTINCT m.id) as message_count,
  MAX(m.created_at) as last_activity
FROM threads t
LEFT JOIN users u ON t.created_by = u.id
LEFT JOIN messages m ON m.thread_id = t.id
GROUP BY t.id, u.id, u.name, u.email, u.avatar_url;

-- View: User permissions (flattened)
CREATE VIEW user_permissions AS
SELECT
  u.id as user_id,
  u.email,
  p.repo,
  p.role,
  'direct' as source
FROM users u
JOIN permissions p ON p.user_id = u.id
UNION ALL
SELECT
  u.id as user_id,
  u.email,
  p.repo,
  p.role,
  CONCAT('team:', t.name) as source
FROM users u
JOIN team_members tm ON tm.user_id = u.id
JOIN teams t ON t.id = tm.team_id
JOIN permissions p ON p.team_id = t.id;

-- Initial data: Create a system user for automated actions
INSERT INTO users (email, name, provider, provider_id, avatar_url)
VALUES ('system@repo-comments.internal', 'System', 'internal', 'system', null)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE threads IS 'Comment threads anchored to code or UI elements';
COMMENT ON TABLE messages IS 'Individual messages within a thread';
COMMENT ON TABLE permissions IS 'Repository-level access control';
COMMENT ON COLUMN threads.context_type IS 'Determines whether this comment is on code or UI';
COMMENT ON COLUMN threads.selector IS 'CSS selector for UI element (e.g., ".button.primary")';
COMMENT ON COLUMN threads.coordinates IS 'Absolute position for UI comments { x, y, width, height }';
