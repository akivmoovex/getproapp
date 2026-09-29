-- Per-organisation pilot readiness notes, manual review marks, and final approval.
-- Does not auto-publish or activate. Idempotent via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_pilot_readiness_item_notes (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  note TEXT,
  manual_status TEXT
    CHECK (
      manual_status IS NULL
      OR manual_status IN ('complete', 'incomplete', 'needs_review')
    ),
  updated_by_actor_type TEXT,
  updated_by_actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_pilot_readiness_item_notes_key_check
    CHECK (char_length(item_key) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS church_pilot_readiness_item_notes_org_item_uniq
  ON public.church_pilot_readiness_item_notes (organization_id, item_key);

CREATE INDEX IF NOT EXISTS idx_church_pilot_readiness_item_notes_org
  ON public.church_pilot_readiness_item_notes (organization_id);

CREATE TABLE IF NOT EXISTS public.church_pilot_readiness_approvals (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  approved_by_actor_type TEXT NOT NULL,
  approved_by_actor_id INTEGER,
  approved_by_label TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  snapshot_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_church_pilot_readiness_approvals_org
  ON public.church_pilot_readiness_approvals (organization_id, approved_at DESC);
