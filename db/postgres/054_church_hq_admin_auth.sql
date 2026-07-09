-- GetPro Church — HQ admin auth fields (Phase 5).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'hq_admin';

UPDATE public.church_hq_admins
SET full_name = display_name
WHERE trim(full_name) = '' AND trim(display_name) <> '';

UPDATE public.church_hq_admins
SET email = lower(trim(username))
WHERE trim(email) = '' AND trim(username) <> '' AND position('@' in username) > 0;

ALTER TABLE public.church_hq_admins
  DROP CONSTRAINT IF EXISTS church_hq_admins_role_check;

ALTER TABLE public.church_hq_admins
  ADD CONSTRAINT church_hq_admins_role_check
  CHECK (role IN ('hq_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_hq_admins_org_email_active
  ON public.church_hq_admins (organization_id, lower(trim(email)))
  WHERE status = 'active' AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_church_hq_admins_org_phone
  ON public.church_hq_admins (organization_id, phone_normalized);
