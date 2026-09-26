-- V2.03 shared platform foundation (BlessBoard + ActiveClinic).
-- Technical job shell + communication preferences + policy acceptances.
-- Does NOT model patients, members, clinical consent, or invoices.
-- Products supply entity_key / subject_ref adapters; never trust client tenant IDs.
-- Idempotent. Not applied overnight on hosted DB.

CREATE TABLE IF NOT EXISTS platform.data_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  job_kind TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  facility_id UUID NULL,
  branch_id UUID NULL,
  input_file_ref TEXT NULL,
  output_file_ref TEXT NULL,
  error_report_ref TEXT NULL,
  progress_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT data_jobs_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT data_jobs_kind_check
    CHECK (job_kind IN ('import', 'export')),
  CONSTRAINT data_jobs_status_check
    CHECK (
      status IN (
        'queued',
        'validating',
        'running',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),
  CONSTRAINT data_jobs_entity_key_len
    CHECK (char_length(entity_key) BETWEEN 1 AND 120),
  CONSTRAINT data_jobs_input_file_ref_len
    CHECK (input_file_ref IS NULL OR char_length(input_file_ref) BETWEEN 1 AND 500),
  CONSTRAINT data_jobs_output_file_ref_len
    CHECK (output_file_ref IS NULL OR char_length(output_file_ref) BETWEEN 1 AND 500),
  CONSTRAINT data_jobs_error_report_ref_len
    CHECK (error_report_ref IS NULL OR char_length(error_report_ref) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS data_jobs_org_product_created_idx
  ON platform.data_jobs (organization_id, product_code, created_at DESC);

CREATE INDEX IF NOT EXISTS data_jobs_org_status_idx
  ON platform.data_jobs (organization_id, status);

CREATE TABLE IF NOT EXISTS platform.data_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  actor_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  note TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT data_job_events_job_fk
    FOREIGN KEY (job_id)
    REFERENCES platform.data_jobs (id)
    ON DELETE CASCADE,
  CONSTRAINT data_job_events_to_status_len
    CHECK (char_length(to_status) BETWEEN 1 AND 40),
  CONSTRAINT data_job_events_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS data_job_events_job_created_idx
  ON platform.data_job_events (job_id, created_at ASC);

-- Channel preferences keyed by opaque product subject_ref (not patient/member FKs).
CREATE TABLE IF NOT EXISTS platform.communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose_key TEXT NOT NULL,
  opted_in BOOLEAN NOT NULL DEFAULT FALSE,
  facility_id UUID NULL,
  branch_id UUID NULL,
  source TEXT NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT communication_preferences_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT communication_preferences_channel_check
    CHECK (channel IN ('email', 'sms', 'in_app')),
  CONSTRAINT communication_preferences_subject_kind_len
    CHECK (char_length(subject_kind) BETWEEN 1 AND 64),
  CONSTRAINT communication_preferences_subject_ref_len
    CHECK (char_length(subject_ref) BETWEEN 1 AND 200),
  CONSTRAINT communication_preferences_purpose_key_len
    CHECK (char_length(purpose_key) BETWEEN 1 AND 80),
  CONSTRAINT communication_preferences_source_len
    CHECK (source IS NULL OR char_length(source) BETWEEN 1 AND 80),
  CONSTRAINT communication_preferences_unique
    UNIQUE (organization_id, product_code, subject_kind, subject_ref, channel, purpose_key)
);

CREATE INDEX IF NOT EXISTS communication_preferences_org_subject_idx
  ON platform.communication_preferences (
    organization_id, product_code, subject_kind, subject_ref
  );

-- Versioned policy acceptance (terms/privacy/marketing). NOT clinical consent.
CREATE TABLE IF NOT EXISTS platform.policy_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  facility_id UUID NULL,
  branch_id UUID NULL,
  actor_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_acceptances_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT policy_acceptances_policy_key_len
    CHECK (char_length(policy_key) BETWEEN 1 AND 80),
  CONSTRAINT policy_acceptances_policy_version_len
    CHECK (char_length(policy_version) BETWEEN 1 AND 40),
  CONSTRAINT policy_acceptances_subject_kind_len
    CHECK (char_length(subject_kind) BETWEEN 1 AND 64),
  CONSTRAINT policy_acceptances_subject_ref_len
    CHECK (char_length(subject_ref) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS policy_acceptances_org_subject_idx
  ON platform.policy_acceptances (
    organization_id, product_code, subject_kind, subject_ref, policy_key, accepted_at DESC
  );
