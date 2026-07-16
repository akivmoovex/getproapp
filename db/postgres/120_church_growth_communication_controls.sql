-- BlessBoard Growth communication controls: quiet hours + broadcast test deliveries.
-- Idempotent via ensureChurchSchema.
-- No SMS/WhatsApp providers. No Network API channels.

CREATE TABLE IF NOT EXISTS public.church_organization_communication_policies (
  organization_id INTEGER PRIMARY KEY
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME NOT NULL DEFAULT '21:00',
  quiet_hours_end TIME NOT NULL DEFAULT '07:00',
  updated_by_hq_admin_id INTEGER
    REFERENCES public.church_hq_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_comm_policies_quiet_times_differ
    CHECK (quiet_hours_start <> quiet_hours_end)
);

COMMENT ON TABLE public.church_organization_communication_policies IS
  'Growth org communication controls. Quiet hours defer scheduled email broadcasts (org timezone).';

CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_test_deliveries (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  broadcast_id INTEGER NOT NULL
    REFERENCES public.church_hq_broadcasts (id) ON DELETE CASCADE,
  recipient_hq_admin_id INTEGER
    REFERENCES public.church_hq_admins (id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject_rendered TEXT NOT NULL DEFAULT '',
  channels_json JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  requested_by_hq_admin_id INTEGER
    REFERENCES public.church_hq_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_test_deliveries_org
  ON public.church_hq_broadcast_test_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_test_deliveries_broadcast
  ON public.church_hq_broadcast_test_deliveries (broadcast_id, created_at DESC);

COMMENT ON TABLE public.church_hq_broadcast_test_deliveries IS
  'Recorded HQ broadcast test deliveries (email quota meter only; no SMTP provider).';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS communication_consent_updated_at TIMESTAMPTZ;
