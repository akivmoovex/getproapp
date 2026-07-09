-- GetPro Church — HQ admin forgot-password reset requests (Phase 42).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_hq_admin_password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES public.church_branches(id) ON DELETE SET NULL,
  hq_admin_id BIGINT REFERENCES public.church_hq_admins(id) ON DELETE SET NULL,
  identifier_submitted TEXT NOT NULL,
  full_name_submitted TEXT,
  phone_submitted TEXT,
  email_submitted TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  review_comment TEXT,
  resolved_by_platform_admin_id INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_hq_admin_password_reset_requests_status_check
    CHECK (status IN ('submitted', 'reviewed', 'reset_completed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_church_hq_admin_password_reset_requests_org_status_created
  ON public.church_hq_admin_password_reset_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_hq_admin_password_reset_requests_admin_created
  ON public.church_hq_admin_password_reset_requests (hq_admin_id, created_at DESC)
  WHERE hq_admin_id IS NOT NULL;
