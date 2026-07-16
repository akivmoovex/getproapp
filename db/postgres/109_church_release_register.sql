-- Lightweight BlessBoard release / migration register (platform admin only).
-- Idempotent via ensureChurchSchema. No secrets or credentials stored.

CREATE TABLE IF NOT EXISTS public.church_release_records (
  id BIGSERIAL PRIMARY KEY,
  application_version TEXT NOT NULL,
  release_date DATE NOT NULL,
  release_summary TEXT NOT NULL,
  migrations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_notes TEXT,
  known_limitations TEXT,
  package_features_affected_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_env_vars_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_status TEXT NOT NULL
    CHECK (test_status IN ('not_run', 'partial', 'failed', 'passed')),
  test_evidence TEXT,
  deployed_by_label TEXT NOT NULL,
  deployed_by_actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_actor_id INTEGER,
  updated_by_actor_id INTEGER,
  CONSTRAINT church_release_records_version_len
    CHECK (char_length(application_version) BETWEEN 1 AND 64),
  CONSTRAINT church_release_records_summary_len
    CHECK (char_length(release_summary) BETWEEN 1 AND 4000),
  CONSTRAINT church_release_records_rollback_len
    CHECK (rollback_notes IS NULL OR char_length(rollback_notes) <= 4000),
  CONSTRAINT church_release_records_limitations_len
    CHECK (known_limitations IS NULL OR char_length(known_limitations) <= 4000),
  CONSTRAINT church_release_records_evidence_len
    CHECK (test_evidence IS NULL OR char_length(test_evidence) <= 2000),
  CONSTRAINT church_release_records_deployed_by_len
    CHECK (char_length(deployed_by_label) BETWEEN 1 AND 200),
  CONSTRAINT church_release_records_passed_requires_evidence
    CHECK (
      test_status <> 'passed'
      OR (test_evidence IS NOT NULL AND char_length(btrim(test_evidence)) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_church_release_records_version
  ON public.church_release_records (application_version);

CREATE INDEX IF NOT EXISTS idx_church_release_records_release_date
  ON public.church_release_records (release_date DESC, id DESC);
