-- BlessBoard package usage meters (Foundation / Growth).
-- Idempotent: safe at startup via ensureChurchSchema.
-- No billing / invoice columns.

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS storage_bytes_used BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS storage_bytes_reconciled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.church_organizations.timezone IS
  'IANA timezone for monthly usage period boundaries (external emails / scheduled reports).';
COMMENT ON COLUMN public.church_organizations.storage_bytes_used IS
  'Cached attachment storage usage in bytes; maintained incrementally, not scanned on every request.';

CREATE TABLE IF NOT EXISTS public.church_organization_usage_months (
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  usage_month DATE NOT NULL,
  external_emails_count INTEGER NOT NULL DEFAULT 0,
  scheduled_reports_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, usage_month),
  CONSTRAINT church_organization_usage_months_emails_nonneg
    CHECK (external_emails_count >= 0),
  CONSTRAINT church_organization_usage_months_reports_nonneg
    CHECK (scheduled_reports_count >= 0),
  CONSTRAINT church_organization_usage_months_month_day
    CHECK (EXTRACT(DAY FROM usage_month) = 1)
);

CREATE INDEX IF NOT EXISTS idx_church_org_usage_months_org_month
  ON public.church_organization_usage_months (organization_id, usage_month DESC);
