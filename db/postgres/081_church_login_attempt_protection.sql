-- GetPro Church — login attempt protection (Phase 38).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES public.church_organizations(id) ON DELETE SET NULL,
  branch_id BIGINT REFERENCES public.church_branches(id) ON DELETE SET NULL,
  account_type TEXT NOT NULL,
  account_id BIGINT,
  identifier_normalized TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_login_attempts_account_type_check
    CHECK (account_type IN ('member', 'branch_admin', 'hq_admin', 'ministry_leader'))
);

CREATE INDEX IF NOT EXISTS church_login_attempts_org_created_idx
  ON public.church_login_attempts (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS church_login_attempts_branch_created_idx
  ON public.church_login_attempts (branch_id, created_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS church_login_attempts_identifier_created_idx
  ON public.church_login_attempts (account_type, identifier_normalized, created_at DESC);

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS last_successful_login_at TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS last_successful_login_at TIMESTAMPTZ;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS last_successful_login_at TIMESTAMPTZ;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS last_successful_login_at TIMESTAMPTZ;
