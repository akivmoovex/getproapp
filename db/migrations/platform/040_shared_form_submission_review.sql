-- Additive: shared form submission review (SH08–SH15).
-- Idempotency, consent, review statuses, internal notes, optional branch/facility scope.
-- Does not alter legacy blessboard.forms. Idempotent. Not applied overnight on hosted DB.

ALTER TABLE platform.tenant_forms
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS facility_id UUID NULL,
  ADD COLUMN IF NOT EXISTS require_consent BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE platform.tenant_form_submissions
  ADD COLUMN IF NOT EXISTS review_status TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS facility_id UUID NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS status_history_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill review_status from legacy status column
UPDATE platform.tenant_form_submissions
   SET review_status = CASE
     WHEN status = 'archived' THEN 'closed'
     ELSE 'submitted'
   END
 WHERE review_status IS NULL;

ALTER TABLE platform.tenant_form_submissions
  ALTER COLUMN review_status SET DEFAULT 'submitted';

ALTER TABLE platform.tenant_form_submissions
  ALTER COLUMN review_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_form_submissions_review_status_check'
  ) THEN
    ALTER TABLE platform.tenant_form_submissions
      ADD CONSTRAINT tenant_form_submissions_review_status_check
      CHECK (review_status IN (
        'submitted', 'in_review', 'accepted', 'rejected', 'closed'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_form_submissions_internal_notes_len'
  ) THEN
    ALTER TABLE platform.tenant_form_submissions
      ADD CONSTRAINT tenant_form_submissions_internal_notes_len
      CHECK (internal_notes IS NULL OR char_length(internal_notes) BETWEEN 1 AND 5000);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_form_submissions_idempotency_key_len'
  ) THEN
    ALTER TABLE platform.tenant_form_submissions
      ADD CONSTRAINT tenant_form_submissions_idempotency_key_len
      CHECK (
        idempotency_key IS NULL
        OR char_length(idempotency_key) BETWEEN 8 AND 128
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_form_submissions_idempotency_uidx
  ON platform.tenant_form_submissions (form_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_form_submissions_org_review_idx
  ON platform.tenant_form_submissions (
    organization_id, form_id, review_status, submitted_at DESC
  );

CREATE INDEX IF NOT EXISTS tenant_form_submissions_branch_idx
  ON platform.tenant_form_submissions (organization_id, branch_id, submitted_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_form_submissions_facility_idx
  ON platform.tenant_form_submissions (organization_id, facility_id, submitted_at DESC)
  WHERE facility_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.tenant_form_submission_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL
    REFERENCES platform.tenant_forms (id)
    ON DELETE CASCADE,
  bucket_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT tenant_form_submission_rate_limits_bucket_len
    CHECK (char_length(bucket_key) BETWEEN 1 AND 200),
  CONSTRAINT tenant_form_submission_rate_limits_hit_check
    CHECK (hit_count >= 0),
  CONSTRAINT tenant_form_submission_rate_limits_unique
    UNIQUE (form_id, bucket_key)
);

CREATE INDEX IF NOT EXISTS tenant_form_submission_rate_limits_window_idx
  ON platform.tenant_form_submission_rate_limits (window_started_at);
