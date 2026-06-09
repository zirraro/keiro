-- QA columns added to content_calendar to persist validator output.
-- Phase 1 validators (caption + visual-coherence) write here.

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS qa_notes TEXT,
  ADD COLUMN IF NOT EXISTS qa_severity TEXT,
  ADD COLUMN IF NOT EXISTS qa_quality_score INT,
  ADD COLUMN IF NOT EXISTS qa_findings JSONB;

CREATE INDEX IF NOT EXISTS idx_content_calendar_qa_severity
  ON content_calendar (qa_severity)
  WHERE qa_severity IN ('block', 'warn');
