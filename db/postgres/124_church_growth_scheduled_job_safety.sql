-- BlessBoard Growth scheduled-job safety: entitlement-transition pause statuses.
-- Adds pause states for broadcasts and reports when org is inactive or entitlement revoked.
-- Idempotent via ensureChurchSchema.

-- Extend church_hq_broadcasts status CHECK to allow new paused statuses.
ALTER TABLE public.church_hq_broadcasts
  DROP CONSTRAINT IF EXISTS church_hq_broadcasts_status_check;

ALTER TABLE public.church_hq_broadcasts
  ADD CONSTRAINT church_hq_broadcasts_status_check
  CHECK (status IN (
    'draft',
    'preview',
    'audience_estimate',
    'approval',
    'scheduled',
    'processing',
    'published',
    'partially_failed',
    'failed',
    'cancelled',
    'archived',
    'paused_no_entitlement',
    'paused_organization_inactive'
  ));

-- Add pause metadata columns to church_hq_broadcasts.
ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Add pause metadata columns to church_scheduled_reports.
-- Reports already have status 'paused' in their CHECK constraint.
ALTER TABLE public.church_scheduled_reports
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

ALTER TABLE public.church_scheduled_reports
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Index for finding paused broadcasts efficiently.
CREATE INDEX IF NOT EXISTS idx_church_hq_broadcasts_paused
  ON public.church_hq_broadcasts (status, organization_id)
  WHERE status IN ('paused_no_entitlement', 'paused_organization_inactive');

-- Index for finding paused reports efficiently.
CREATE INDEX IF NOT EXISTS idx_church_sched_reports_paused
  ON public.church_scheduled_reports (status, organization_id)
  WHERE status = 'paused';
