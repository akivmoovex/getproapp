-- GetPro Church — ministry leader management fields (Phase 15).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS last_password_reset_at TIMESTAMPTZ;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS password_reset_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_church_ministry_leaders_branch_email
  ON public.church_ministry_leaders (branch_id, lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_church_ministry_leaders_branch_phone
  ON public.church_ministry_leaders (branch_id, phone_normalized);
