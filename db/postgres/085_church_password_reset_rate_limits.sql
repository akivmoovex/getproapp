-- GetPro Church — public password reset request rate limits (Phase 43).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_password_reset_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES public.church_branches(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  identifier_normalized TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_password_reset_rate_limits_request_type_check
    CHECK (request_type IN ('member', 'branch_admin', 'hq_admin'))
);

CREATE INDEX IF NOT EXISTS idx_church_password_reset_rate_limits_type_identifier_last
  ON public.church_password_reset_rate_limits (request_type, identifier_normalized, last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_password_reset_rate_limits_org_branch_type_last
  ON public.church_password_reset_rate_limits (organization_id, branch_id, request_type, last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_password_reset_rate_limits_ip_type_last
  ON public.church_password_reset_rate_limits (ip_address, request_type, last_attempt_at DESC)
  WHERE ip_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_password_reset_rate_limits_bucket
  ON public.church_password_reset_rate_limits (
    request_type,
    COALESCE(organization_id, 0),
    COALESCE(branch_id, 0),
    identifier_normalized
  );
