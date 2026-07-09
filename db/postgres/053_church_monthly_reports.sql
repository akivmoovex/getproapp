-- GetPro Church — monthly report fields (Phase 4B).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS starting_members INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS new_members INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS transferred_members INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS inactive_members INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS ending_members INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS sunday_average NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS midweek_average NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS children_average NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS youth_average NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS visitors_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS services_held INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS ministry_meetings_held INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS department_meetings_held INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS outreach_activities INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS special_events INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS ministry_activity_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS main_challenges TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS support_needed_from_hq TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS giving_summary_id INTEGER REFERENCES public.church_giving_summaries (id) ON DELETE SET NULL;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS giving_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS attendance_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS hq_review_comment TEXT;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS submitted_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

UPDATE public.church_monthly_reports
SET status = 'changes_requested'
WHERE status = 'returned';

ALTER TABLE public.church_monthly_reports
  DROP CONSTRAINT IF EXISTS church_monthly_reports_status_check;

ALTER TABLE public.church_monthly_reports
  ADD CONSTRAINT church_monthly_reports_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'changes_requested'));

CREATE INDEX IF NOT EXISTS idx_church_monthly_reports_branch_status
  ON public.church_monthly_reports (branch_id, status);
