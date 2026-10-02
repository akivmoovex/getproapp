-- Foundation inactivity / dormancy (distinct from suspension).
-- Production deletion is NOT activated. Data preserved after dormancy.
-- Idempotent via ensureChurchSchema.

ALTER TABLE public.church_organizations
  DROP CONSTRAINT IF EXISTS church_organizations_status_check;

ALTER TABLE public.church_organizations
  ADD CONSTRAINT church_organizations_status_check
  CHECK (status IN ('active', 'suspended', 'archived', 'dormant'));

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS dormant_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS dormant_by_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS last_genuine_activity_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS last_genuine_activity_sources JSONB;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS dormancy_data_preserve_until TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS reactivated_from_dormancy_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.church_organization_inactivity_warnings (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  warning_stage TEXT NOT NULL,
  based_on_activity_at TIMESTAMPTZ NOT NULL,
  job_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT church_org_inactivity_warnings_stage_check
    CHECK (warning_stage IN ('first', 'final', 'dormant')),
  CONSTRAINT church_org_inactivity_warnings_status_check
    CHECK (status IN ('pending', 'recorded', 'skipped')),
  CONSTRAINT church_org_inactivity_warnings_job_key UNIQUE (job_key)
);

-- Refresh stage check so re-runs can add `dormant` job markers after early installs.
ALTER TABLE public.church_organization_inactivity_warnings
  DROP CONSTRAINT IF EXISTS church_org_inactivity_warnings_stage_check;

ALTER TABLE public.church_organization_inactivity_warnings
  ADD CONSTRAINT church_org_inactivity_warnings_stage_check
    CHECK (warning_stage IN ('first', 'final', 'dormant'));

CREATE INDEX IF NOT EXISTS idx_church_org_inactivity_warnings_org
  ON public.church_organization_inactivity_warnings (organization_id, warning_stage);

CREATE INDEX IF NOT EXISTS idx_church_organizations_dormant_at
  ON public.church_organizations (dormant_at)
  WHERE status = 'dormant';
