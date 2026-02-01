-- Seed Data for Development/Testing
-- Repository-Native Commenting System

-- Create sample users
INSERT INTO users (email, name, provider, provider_id, avatar_url) VALUES
('alice@example.com', 'Alice Designer', 'github', 'github-123', 'https://i.pravatar.cc/150?img=1'),
('bob@example.com', 'Bob Engineer', 'github', 'github-456', 'https://i.pravatar.cc/150?img=2'),
('carol@example.com', 'Carol ProductOwner', 'google', 'google-789', 'https://i.pravatar.cc/150?img=3'),
('dave@example.com', 'Dave DevLead', 'github', 'github-101', 'https://i.pravatar.cc/150?img=4')
ON CONFLICT (email) DO NOTHING;

-- Create sample teams
INSERT INTO teams (name, org, description) VALUES
('Design Team', 'acme-corp', 'UI/UX designers responsible for prototypes'),
('Engineering Team', 'acme-corp', 'Frontend and backend engineers'),
('Product Team', 'acme-corp', 'Product managers and stakeholders')
ON CONFLICT (org, name) DO NOTHING;

-- Add users to teams
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'member'
FROM teams t, users u
WHERE t.name = 'Design Team' AND u.email = 'alice@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'admin'
FROM teams t, users u
WHERE t.name = 'Engineering Team' AND u.email IN ('bob@example.com', 'dave@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'member'
FROM teams t, users u
WHERE t.name = 'Product Team' AND u.email = 'carol@example.com'
ON CONFLICT DO NOTHING;

-- Create repository permissions
INSERT INTO permissions (repo, user_id, role)
SELECT 'acme-corp/design-system', u.id, 'admin'
FROM users u
WHERE u.email = 'dave@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (repo, team_id, role)
SELECT 'acme-corp/design-system', t.id, 'write'
FROM teams t
WHERE t.name IN ('Design Team', 'Engineering Team')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (repo, team_id, role)
SELECT 'acme-corp/design-system', t.id, 'read'
FROM teams t
WHERE t.name = 'Product Team'
ON CONFLICT DO NOTHING;

-- Create sample threads

-- Thread 1: UI comment on button component
INSERT INTO threads (
  repo, branch, context_type, selector, coordinates,
  status, priority, tags, created_by
)
SELECT
  'acme-corp/design-system',
  'feature/new-dashboard',
  'ui',
  'button.primary-cta',
  '{"x": 450, "y": 320, "width": 120, "height": 40}'::jsonb,
  'open',
  'high',
  ARRAY['design', 'accessibility'],
  u.id
FROM users u WHERE u.email = 'alice@example.com';

-- Add messages to thread 1
INSERT INTO messages (thread_id, author_id, content)
SELECT
  t.id,
  u.id,
  'The contrast ratio on this primary button doesn''t meet WCAG AA standards. Can we darken the background or lighten the text?'
FROM threads t, users u
WHERE t.selector = 'button.primary-cta' AND u.email = 'alice@example.com';

INSERT INTO messages (thread_id, author_id, content)
SELECT
  t.id,
  u.id,
  'Good catch! I''ll update the color token to use `--primary-700` instead of `--primary-500`. That should get us to 4.5:1 contrast.'
FROM threads t, users u
WHERE t.selector = 'button.primary-cta' AND u.email = 'bob@example.com';

-- Thread 2: Code comment on authentication logic
INSERT INTO threads (
  repo, branch, context_type, file_path, line_start, line_end,
  code_snippet, status, priority, tags, created_by
)
SELECT
  'acme-corp/design-system',
  'main',
  'code',
  'src/auth/LoginForm.tsx',
  42,
  48,
  E'  if (!email || !password) {\n    throw new Error(\"Missing credentials\");\n  }',
  'open',
  'critical',
  ARRAY['security', 'validation'],
  u.id
FROM users u WHERE u.email = 'dave@example.com';

INSERT INTO messages (thread_id, author_id, content, mentions)
SELECT
  t.id,
  u1.id,
  '@bob This error handling exposes whether an email exists in our system. We should use a generic message instead to prevent user enumeration attacks.',
  ARRAY[u2.id]
FROM threads t, users u1, users u2
WHERE t.file_path = 'src/auth/LoginForm.tsx'
  AND u1.email = 'dave@example.com'
  AND u2.email = 'bob@example.com';

INSERT INTO messages (thread_id, author_id, content)
SELECT
  t.id,
  u.id,
  'Absolutely right. I''ll change this to return a generic "Invalid credentials" message regardless of which field is wrong.'
FROM threads t, users u
WHERE t.file_path = 'src/auth/LoginForm.tsx' AND u.email = 'bob@example.com';

-- Thread 3: Resolved UI comment
INSERT INTO threads (
  repo, branch, context_type, selector,
  status, priority, tags, created_by, resolved_by, resolved_at
)
SELECT
  'acme-corp/design-system',
  'main',
  'ui',
  'nav.main-header',
  'resolved',
  'normal',
  ARRAY['design', 'mobile'],
  u1.id,
  u2.id,
  NOW() - INTERVAL '2 days'
FROM users u1, users u2
WHERE u1.email = 'alice@example.com' AND u2.email = 'bob@example.com';

INSERT INTO messages (thread_id, author_id, content, created_at)
SELECT
  t.id,
  u.id,
  'The navigation header should be sticky on mobile viewports. Can we add `position: sticky` to this element?',
  NOW() - INTERVAL '3 days'
FROM threads t, users u
WHERE t.selector = 'nav.main-header' AND u.email = 'alice@example.com';

INSERT INTO messages (thread_id, author_id, content, created_at)
SELECT
  t.id,
  u.id,
  'Done! Added sticky positioning with a 56px offset to account for the safe area on iOS.',
  NOW() - INTERVAL '2 days'
FROM threads t, users u
WHERE t.selector = 'nav.main-header' AND u.email = 'bob@example.com';

-- Add reactions to messages
INSERT INTO reactions (message_id, user_id, emoji)
SELECT m.id, u.id, '👍'
FROM messages m, users u
WHERE m.content LIKE '%Done! Added sticky%' AND u.email IN ('alice@example.com', 'dave@example.com');

INSERT INTO reactions (message_id, user_id, emoji)
SELECT m.id, u.id, '🎉'
FROM messages m, users u
WHERE m.content LIKE '%Done! Added sticky%' AND u.email = 'carol@example.com';

-- Create sample webhook
INSERT INTO webhooks (repo, url, events, created_by)
SELECT
  'acme-corp/design-system',
  'https://hooks.slack.com/services/XXXXX/YYYYY/ZZZZZ',
  ARRAY['thread.created', 'thread.resolved', 'message.added'],
  u.id
FROM users u WHERE u.email = 'dave@example.com';

-- Create sample notifications
INSERT INTO notifications (user_id, thread_id, message_id, type, content)
SELECT
  u.id,
  t.id,
  m.id,
  'mention',
  'Dave DevLead mentioned you in a comment on src/auth/LoginForm.tsx'
FROM users u, threads t, messages m
WHERE u.email = 'bob@example.com'
  AND t.file_path = 'src/auth/LoginForm.tsx'
  AND m.content LIKE '%@bob%';

-- Create audit log entries
INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, created_at)
SELECT
  t.created_by,
  'thread.created',
  'thread',
  t.id,
  jsonb_build_object(
    'repo', t.repo,
    'branch', t.branch,
    'context_type', t.context_type
  ),
  t.created_at
FROM threads t;

INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, created_at)
SELECT
  m.author_id,
  'message.added',
  'message',
  m.id,
  jsonb_build_object(
    'thread_id', m.thread_id,
    'content_length', LENGTH(m.content)
  ),
  m.created_at
FROM messages m;

-- Verify seed data
DO $$
DECLARE
  user_count INT;
  thread_count INT;
  message_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users WHERE provider != 'internal';
  SELECT COUNT(*) INTO thread_count FROM threads;
  SELECT COUNT(*) INTO message_count FROM messages;

  RAISE NOTICE 'Seed data summary:';
  RAISE NOTICE '  Users: %', user_count;
  RAISE NOTICE '  Threads: %', thread_count;
  RAISE NOTICE '  Messages: %', message_count;
END $$;
