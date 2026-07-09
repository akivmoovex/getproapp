-- GetPro Church — member directory admin fields (Phase 17).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS suspended_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS reactivated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS last_admin_note_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_church_members_branch_status_name
  ON public.church_members (branch_id, status, full_name);
