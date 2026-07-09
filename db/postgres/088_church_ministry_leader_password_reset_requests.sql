-- GetPro Church — ministry leader forgot-password reset requests (Phase 49).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_ministry_leader_password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  ministry_leader_id BIGINT REFERENCES public.church_ministry_leaders(id) ON DELETE SET NULL,
  ministry_id BIGINT REFERENCES public.church_ministries(id) ON DELETE SET NULL,
  identifier_submitted TEXT NOT NULL,
  full_name_submitted TEXT,
  phone_submitted TEXT,
  email_submitted TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  review_comment TEXT,
  resolved_by_branch_admin_id BIGINT REFERENCES public.church_branch_admins(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_ministry_leader_password_reset_requests_status_check
    CHECK (status IN ('submitted', 'reviewed', 'reset_completed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_church_ministry_leader_password_reset_requests_branch_status_created
  ON public.church_ministry_leader_password_reset_requests (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_ministry_leader_password_reset_requests_org_status_created
  ON public.church_ministry_leader_password_reset_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_ministry_leader_password_reset_requests_leader_created
  ON public.church_ministry_leader_password_reset_requests (ministry_leader_id, created_at DESC)
  WHERE ministry_leader_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_ministry_leader_password_reset_requests_ministry_created
  ON public.church_ministry_leader_password_reset_requests (ministry_id, created_at DESC)
  WHERE ministry_id IS NOT NULL;

ALTER TABLE public.church_password_reset_rate_limits
  DROP CONSTRAINT IF EXISTS church_password_reset_rate_limits_request_type_check;

ALTER TABLE public.church_password_reset_rate_limits
  ADD CONSTRAINT church_password_reset_rate_limits_request_type_check
    CHECK (request_type IN ('member', 'branch_admin', 'hq_admin', 'ministry_leader'));
