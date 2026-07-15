-- BlessBoard Growth scheduled HQ broadcasts.
-- Extends church_hq_broadcasts workflow statuses, audience targeting, consent, delivery audit.
-- Idempotent via ensureChurchSchema.

-- Workflow statuses (keep draft/published/archived for Foundation immediate path).
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
    'archived'
  ));

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS audience_estimate_json JSONB;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS approved_by_hq_admin_id BIGINT
    REFERENCES public.church_hq_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS job_key TEXT;

ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_hq_broadcasts_job_key
  ON public.church_hq_broadcasts (job_key)
  WHERE job_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcasts_scheduled_due
  ON public.church_hq_broadcasts (publish_at)
  WHERE status = 'scheduled';

-- Ministry / department (group) / event targeting
CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_ministry_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  ministry_id INTEGER NOT NULL
    REFERENCES public.church_ministries (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, ministry_id)
);

CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_department_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL
    REFERENCES public.church_departments (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, department_id)
);

CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_event_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL
    REFERENCES public.church_events (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_selected_recipients (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_hq_broadcast_selected_recipients_type_check
    CHECK (recipient_type IN ('member', 'branch_admin', 'hq_admin', 'leader')),
  UNIQUE (broadcast_id, recipient_type, recipient_id)
);

-- Per-recipient delivery audit (in_app + email). Idempotent retries.
CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_deliveries (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_hq_broadcast_deliveries_channel_check
    CHECK (channel IN ('in_app', 'email')),
  CONSTRAINT church_hq_broadcast_deliveries_status_check
    CHECK (status IN ('delivered', 'failed', 'skipped_unauthorised', 'skipped_consent', 'skipped_quota')),
  CONSTRAINT church_hq_broadcast_deliveries_idem UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_deliveries_org
  ON public.church_hq_broadcast_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_deliveries_broadcast
  ON public.church_hq_broadcast_deliveries (broadcast_id, status);

-- Communication consent (email channel). Default true preserves existing feeds; opt-out respected.
ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS communication_consent BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS communication_consent BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS communication_consent BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.church_ministry_leaders
  ADD COLUMN IF NOT EXISTS communication_consent BOOLEAN NOT NULL DEFAULT true;
