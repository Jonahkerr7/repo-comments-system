-- Migration: Fix deployment-comment linking
-- Adds explicit deployment_id FK and activates stats triggers

-- 1. Add deployment_id to threads for explicit linking
ALTER TABLE threads ADD COLUMN IF NOT EXISTS deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_threads_deployment ON threads(deployment_id);

-- 2. Drop existing trigger if it exists (to avoid duplicates)
DROP TRIGGER IF EXISTS update_deployment_stats_on_message ON messages;
DROP TRIGGER IF EXISTS update_deployment_stats_on_thread_change ON threads;

-- 3. Create updated trigger function that handles both NEW and OLD records
CREATE OR REPLACE FUNCTION update_deployment_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_repo VARCHAR;
  target_branch VARCHAR;
BEGIN
  -- Get repo/branch from thread (for both message and thread triggers)
  IF TG_TABLE_NAME = 'messages' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT repo, branch INTO target_repo, target_branch FROM threads WHERE id = OLD.thread_id;
    ELSE
      SELECT repo, branch INTO target_repo, target_branch FROM threads WHERE id = NEW.thread_id;
    END IF;
  ELSE
    -- Thread table trigger
    IF TG_OP = 'DELETE' THEN
      target_repo := OLD.repo;
      target_branch := OLD.branch;
    ELSE
      target_repo := NEW.repo;
      target_branch := NEW.branch;
    END IF;
  END IF;

  -- Skip if no repo/branch found
  IF target_repo IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update deployment stats
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
  WHERE d.repo = target_repo AND d.branch = target_branch;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Attach triggers to messages table
CREATE TRIGGER update_deployment_stats_on_message
AFTER INSERT OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_deployment_stats();

-- 5. Attach triggers to threads table (for status changes and new threads)
CREATE TRIGGER update_deployment_stats_on_thread_change
AFTER INSERT OR UPDATE OR DELETE ON threads
FOR EACH ROW
EXECUTE FUNCTION update_deployment_stats();

-- 6. Backfill deployment_id for existing threads
UPDATE threads t
SET deployment_id = (
  SELECT d.id FROM deployments d
  WHERE d.repo = t.repo AND d.branch = t.branch
  ORDER BY d.created_at DESC
  LIMIT 1
)
WHERE deployment_id IS NULL;

-- 7. Recalculate all deployment stats (one-time fix)
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
  );

-- 8. Add comments
COMMENT ON COLUMN threads.deployment_id IS 'Explicit link to the deployment this thread belongs to';
