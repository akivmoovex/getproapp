-- GetPro Church — platform member support action metadata (Phase 32).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS platform_last_password_reset_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS platform_password_reset_by_admin_id INTEGER;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS platform_status_updated_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS platform_status_updated_by_admin_id INTEGER;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS platform_status_reason TEXT;
