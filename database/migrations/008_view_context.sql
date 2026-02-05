-- Migration 008: Add view_context column for tracking UI state (tabs, modals, etc.)
-- This allows comments to be associated with specific view states

ALTER TABLE threads ADD COLUMN IF NOT EXISTS view_context JSONB;

-- Add comment explaining the column
COMMENT ON COLUMN threads.view_context IS 'UI view state context { hash, pathname, activeTabs[], activeModal }';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_threads_view_context ON threads USING GIN(view_context);
