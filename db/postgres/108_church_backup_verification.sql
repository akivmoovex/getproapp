-- Application-level backup verification records (operator-attested).
-- Does not perform or invent infrastructure backups. Idempotent via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_backup_verification_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('backup_verified', 'restoration_test', 'backup_check_failed')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'failed', 'partial')),
  verified_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_actor_type TEXT,
  recorded_by_actor_id INTEGER,
  recorded_by_label TEXT,
  environment_label TEXT,
  evidence_reference TEXT,
  notes TEXT,
  metadata_json JSONB,
  CONSTRAINT church_backup_verification_events_evidence_len
    CHECK (evidence_reference IS NULL OR char_length(evidence_reference) <= 500),
  CONSTRAINT church_backup_verification_events_notes_len
    CHECK (notes IS NULL OR char_length(notes) <= 4000),
  CONSTRAINT church_backup_verification_events_env_len
    CHECK (environment_label IS NULL OR char_length(environment_label) <= 120)
);

CREATE INDEX IF NOT EXISTS idx_church_backup_verification_events_type_verified
  ON public.church_backup_verification_events (event_type, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_backup_verification_events_recorded
  ON public.church_backup_verification_events (recorded_at DESC);
