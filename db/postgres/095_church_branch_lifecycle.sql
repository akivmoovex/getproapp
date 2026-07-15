-- BlessBoard branch lifecycle phase + billing readiness (additive).
-- Operational status remains active | suspended | archived (073_church_status_management.sql).

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS lifecycle_phase TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS billing_ready BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing operational status (safe defaults).
UPDATE public.church_branches
SET lifecycle_phase = 'active'
WHERE status = 'active' AND (lifecycle_phase IS NULL OR trim(lifecycle_phase) = '');

UPDATE public.church_branches
SET lifecycle_phase = 'temporarily_inactive'
WHERE status = 'suspended' AND (lifecycle_phase IS NULL OR trim(lifecycle_phase) = '');

UPDATE public.church_branches
SET lifecycle_phase = 'archived'
WHERE status = 'archived' AND (lifecycle_phase IS NULL OR trim(lifecycle_phase) = '');

CREATE INDEX IF NOT EXISTS idx_church_branches_org_active
  ON public.church_branches (organization_id)
  WHERE status = 'active';
