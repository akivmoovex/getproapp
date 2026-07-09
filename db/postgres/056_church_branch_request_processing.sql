-- GetPro Church — branch request/prayer processing fields (Phase 7).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_member_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_member_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.church_member_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_church_member_requests_branch_status
  ON public.church_member_requests (branch_id, status);

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS admin_comment TEXT;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_church_prayer_requests_branch_status
  ON public.church_prayer_requests (branch_id, status);
