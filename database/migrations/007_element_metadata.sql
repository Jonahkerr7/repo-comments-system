-- Migration: Add element metadata for better UI comment context
-- This enables showing user-friendly element descriptions instead of CSS selectors

-- Add element metadata columns
ALTER TABLE threads ADD COLUMN IF NOT EXISTS element_tag VARCHAR(50);
ALTER TABLE threads ADD COLUMN IF NOT EXISTS element_text TEXT;

-- Update the thread_summary view to include new columns
DROP VIEW IF EXISTS thread_summary;

CREATE VIEW thread_summary AS
SELECT
  t.id,
  t.repo,
  t.branch,
  t.commit_hash,
  t.context_type,
  t.file_path,
  t.line_start,
  t.line_end,
  t.code_snippet,
  t.selector,
  t.xpath,
  t.coordinates,
  t.screenshot_url,
  t.element_tag,
  t.element_text,
  t.status,
  t.priority,
  t.tags,
  t.created_by,
  t.created_at,
  t.resolved_by,
  t.resolved_at,
  t.deployment_id,
  u.name as creator_name,
  u.email as creator_email,
  u.avatar_url as creator_avatar,
  (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as message_count
FROM threads t
LEFT JOIN users u ON t.created_by = u.id;

-- Add comment to document the columns
COMMENT ON COLUMN threads.element_tag IS 'HTML tag name of the commented element (e.g., button, h1)';
COMMENT ON COLUMN threads.element_text IS 'Text content of the commented element (first 100 chars)';
