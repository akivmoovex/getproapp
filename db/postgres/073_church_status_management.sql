-- GetPro Church — organization and branch status management (Phase 25).
-- Idempotent: safe at startup via ensureChurchSchema.

UPDATE public.church_organizations
SET status = 'archived'
WHERE status = 'inactive';

UPDATE public.church_branches
SET status = 'archived'
WHERE status = 'inactive';

ALTER TABLE public.church_organizations
  DROP CONSTRAINT IF EXISTS church_organizations_status_check;

ALTER TABLE public.church_organizations
  ADD CONSTRAINT church_organizations_status_check
  CHECK (status IN ('active', 'suspended', 'archived', 'dormant'));

ALTER TABLE public.church_branches
  DROP CONSTRAINT IF EXISTS church_branches_status_check;

ALTER TABLE public.church_branches
  ADD CONSTRAINT church_branches_status_check
  CHECK (status IN ('active', 'suspended', 'archived'));

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by_platform_admin_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_platform_admin_id INTEGER,
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by_platform_admin_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_platform_admin_id INTEGER,
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_church_organizations_status
  ON public.church_organizations (status);

CREATE INDEX IF NOT EXISTS idx_church_branches_status
  ON public.church_branches (status);
