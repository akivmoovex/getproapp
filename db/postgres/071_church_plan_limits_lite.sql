-- GetPro Church — plan limits metadata (Phase 23).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS plan_notes TEXT;

ALTER TABLE public.church_organizations
  DROP CONSTRAINT IF EXISTS church_organizations_plan_status_check;

ALTER TABLE public.church_organizations
  ADD CONSTRAINT church_organizations_plan_status_check
  CHECK (plan_status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_church_organizations_plan_status
  ON public.church_organizations (plan_status);
