-- Migration: Add Double Diamond workflow phase to deployments
-- Enables kanban-style workflow management for UX/PO users

-- Add phase column with default 'discover'
ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS phase VARCHAR(50) DEFAULT 'discover';

-- Add constraint for valid phases
ALTER TABLE deployments
ADD CONSTRAINT valid_phase CHECK (
  phase IN ('discover', 'define', 'develop', 'deliver')
);

-- Add phase tracking columns
ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS phase_changed_at TIMESTAMP;

ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS phase_changed_by UUID REFERENCES users(id);

-- Index for phase queries (kanban board filtering)
CREATE INDEX IF NOT EXISTS idx_deployments_phase ON deployments(phase);

-- Composite index for kanban view (phase + repo filtering)
CREATE INDEX IF NOT EXISTS idx_deployments_phase_repo ON deployments(phase, repo);

-- Comments
COMMENT ON COLUMN deployments.phase IS 'Double Diamond phase: discover, define, develop, deliver';
COMMENT ON COLUMN deployments.phase_changed_at IS 'When the phase was last changed';
COMMENT ON COLUMN deployments.phase_changed_by IS 'User who changed the phase';
