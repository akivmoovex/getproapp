-- GetPro Church — member forgot-password reset requests (Phase 40).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_member_password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  member_id BIGINT REFERENCES public.church_members(id) ON DELETE SET NULL,
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
  CONSTRAINT church_member_password_reset_requests_status_check
    CHECK (status IN ('submitted', 'reviewed', 'reset_completed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_church_member_password_reset_requests_branch_status_created
  ON public.church_member_password_reset_requests (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_member_password_reset_requests_member_created
  ON public.church_member_password_reset_requests (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_member_password_reset_requests_org_created
  ON public.church_member_password_reset_requests (organization_id, created_at DESC);
