-- GetPro Church — attendance tracker + giving summary fields (Phase 4A).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS attendance_type TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS service_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS adults_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS youth_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS children_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS first_time_visitors_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS new_members_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS volunteers_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_attendance_records
  ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

UPDATE public.church_attendance_records
SET service_name = service_label
WHERE trim(service_name) = '' AND trim(service_label) <> '';

UPDATE public.church_attendance_records
SET adults_count = headcount
WHERE adults_count = 0 AND headcount > 0;

UPDATE public.church_attendance_records
SET status = 'draft'
WHERE status IN ('recorded', 'void');

ALTER TABLE public.church_attendance_records
  DROP CONSTRAINT IF EXISTS church_attendance_records_status_check;

ALTER TABLE public.church_attendance_records
  ADD CONSTRAINT church_attendance_records_status_check
  CHECK (status IN ('draft', 'submitted', 'synced_to_monthly_report'));

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS tithes_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS offerings_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS building_fund_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS missions_fund_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS special_offerings_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS other_giving_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.church_giving_summaries
  ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

UPDATE public.church_giving_summaries
SET tithes_total = (total_amount_cents::numeric / 100)
WHERE tithes_total = 0 AND total_amount_cents > 0;

UPDATE public.church_giving_summaries
SET status = 'submitted'
WHERE status = 'finalized';

ALTER TABLE public.church_giving_summaries
  DROP CONSTRAINT IF EXISTS church_giving_summaries_status_check;

ALTER TABLE public.church_giving_summaries
  ADD CONSTRAINT church_giving_summaries_status_check
  CHECK (status IN ('draft', 'submitted', 'included_in_monthly_report'));

CREATE INDEX IF NOT EXISTS idx_church_attendance_branch_status
  ON public.church_attendance_records (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_church_giving_summaries_branch_status
  ON public.church_giving_summaries (branch_id, status);
