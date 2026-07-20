-- Lightweight deterministic registration risk review (no external fraud vendors).
-- Stores allowlisted decision + reason codes for admin explainability.

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS risk_decision TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS risk_reason_codes TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS risk_decided_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS review_events JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_risk_decision_check'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_risk_decision_check
      CHECK (
        risk_decision IS NULL
        OR risk_decision IN ('allow', 'review_required', 'reject')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_rejection_reason_len'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_rejection_reason_len
      CHECK (
        rejection_reason IS NULL
        OR char_length(rejection_reason) BETWEEN 1 AND 500
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_review_events_is_array'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_review_events_is_array
      CHECK (jsonb_typeof(review_events) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_risk_decision_created_idx
  ON blessboard.platform_church_registration_applications (risk_decision, created_at DESC)
  WHERE risk_decision IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_source_ip_created_idx
  ON blessboard.platform_church_registration_applications (source_ip, created_at DESC)
  WHERE source_ip IS NOT NULL;
