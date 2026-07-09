-- GetPro Church — ministry activity review + monthly report snapshot (Phase 14).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_ministry_activity_notes
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_ministry_activity_notes
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.church_ministry_activity_notes
  ADD COLUMN IF NOT EXISTS admin_comment TEXT;

ALTER TABLE public.church_ministry_activity_notes
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'submitted';

UPDATE public.church_ministry_activity_notes
SET review_status = 'submitted'
WHERE status = 'submitted' AND (review_status IS NULL OR trim(review_status) = '');

ALTER TABLE public.church_ministry_activity_notes
  DROP CONSTRAINT IF EXISTS church_ministry_activity_notes_review_status_check;

ALTER TABLE public.church_ministry_activity_notes
  ADD CONSTRAINT church_ministry_activity_notes_review_status_check
  CHECK (review_status IN ('submitted', 'reviewed', 'follow_up_requested'));

CREATE INDEX IF NOT EXISTS idx_church_ministry_activity_notes_branch_review
  ON public.church_ministry_activity_notes (branch_id, review_status);

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS ministry_activity_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;
