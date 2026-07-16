-- Persistent account authentication version for centralized session revocation.
-- Idempotent via ensureChurchSchema. Safe default 1 — existing sessions without a
-- stamped version are treated as stale and must re-login after this ships.
-- Never stores secrets. Incremented on password, status, role, and scope changes.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS security_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS security_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS security_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS security_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS security_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.church_members
  DROP CONSTRAINT IF EXISTS church_members_security_version_positive;
ALTER TABLE public.church_members
  ADD CONSTRAINT church_members_security_version_positive CHECK (security_version >= 1);

ALTER TABLE public.church_branch_admins
  DROP CONSTRAINT IF EXISTS church_branch_admins_security_version_positive;
ALTER TABLE public.church_branch_admins
  ADD CONSTRAINT church_branch_admins_security_version_positive CHECK (security_version >= 1);

ALTER TABLE public.church_hq_admins
  DROP CONSTRAINT IF EXISTS church_hq_admins_security_version_positive;
ALTER TABLE public.church_hq_admins
  ADD CONSTRAINT church_hq_admins_security_version_positive CHECK (security_version >= 1);

ALTER TABLE public.church_ministry_leaders
  DROP CONSTRAINT IF EXISTS church_ministry_leaders_security_version_positive;
ALTER TABLE public.church_ministry_leaders
  ADD CONSTRAINT church_ministry_leaders_security_version_positive CHECK (security_version >= 1);

ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_security_version_positive;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_security_version_positive CHECK (security_version >= 1);
