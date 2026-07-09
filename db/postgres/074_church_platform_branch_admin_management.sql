-- GetPro Church — platform branch admin account management metadata (Phase 28).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS updated_by_platform_admin_id INTEGER;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS deactivated_by_platform_admin_id INTEGER;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS reactivated_by_platform_admin_id INTEGER;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS last_password_reset_at TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS password_reset_by_platform_admin_id INTEGER;
