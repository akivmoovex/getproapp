-- GetPro Church — branch admin auth fields + member review comment (Phase 3).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'branch_admin';

UPDATE public.church_branch_admins
SET full_name = display_name
WHERE trim(full_name) = '' AND trim(display_name) <> '';

UPDATE public.church_branch_admins
SET email = lower(trim(username))
WHERE trim(email) = '' AND trim(username) <> '' AND position('@' in username) > 0;

ALTER TABLE public.church_branch_admins
  DROP CONSTRAINT IF EXISTS church_branch_admins_role_check;

ALTER TABLE public.church_branch_admins
  ADD CONSTRAINT church_branch_admins_role_check
  CHECK (role IN ('branch_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_branch_admins_branch_email_active
  ON public.church_branch_admins (branch_id, lower(trim(email)))
  WHERE status = 'active' AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_church_branch_admins_branch_phone
  ON public.church_branch_admins (branch_id, phone_normalized);

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS review_comment TEXT NOT NULL DEFAULT '';
