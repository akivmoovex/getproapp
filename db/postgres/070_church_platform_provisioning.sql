-- GetPro Church — platform provisioning metadata (Phase 22).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'free';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS created_by_platform_admin_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_church_organizations_plan_code
  ON public.church_organizations (plan_code);

CREATE INDEX IF NOT EXISTS idx_church_organizations_status
  ON public.church_organizations (status);
