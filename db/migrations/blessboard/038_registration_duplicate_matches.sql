-- Registration duplicate-check matches + review decisions (Phase2 Batch 12 storage).
-- Normalized columns for identity / score / decision; JSONB only for evidence snapshots.
-- Does not change approval gates. No routes/UI in this migration.

CREATE TABLE IF NOT EXISTS blessboard.registration_duplicate_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE RESTRICT,
  matched_record_type TEXT NOT NULL,
  matched_record_id UUID NOT NULL,
  score INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_decision TEXT NULL,
  review_reason TEXT NULL,
  reviewed_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reg_dup_matches_record_type_check
    CHECK (matched_record_type IN (
      'application',
      'organization',
      'user',
      'church',
      'branch',
      'domain'
    )),
  CONSTRAINT reg_dup_matches_score_range
    CHECK (score >= 0 AND score <= 10000),
  CONSTRAINT reg_dup_matches_risk_level_check
    CHECK (risk_level IN (
      'none',
      'possible',
      'strong',
      'confirmed'
    )),
  CONSTRAINT reg_dup_matches_evidence_is_object
    CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  CONSTRAINT reg_dup_matches_review_decision_check
    CHECK (
      review_decision IS NULL
      OR review_decision IN (
        'different_church',
        'link_existing_church',
        'additional_branch_request',
        'clarification_required',
        'senior_review',
        'impersonation_concern',
        'confirmed_duplicate'
      )
    ),
  CONSTRAINT reg_dup_matches_review_reason_len
    CHECK (
      review_reason IS NULL
      OR char_length(btrim(review_reason)) BETWEEN 1 AND 2000
    ),
  CONSTRAINT reg_dup_matches_review_consistency
    CHECK (
      (
        review_decision IS NULL
        AND review_reason IS NULL
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
      )
      OR (
        review_decision IS NOT NULL
        AND review_reason IS NOT NULL
        AND char_length(btrim(review_reason)) BETWEEN 1 AND 2000
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    ),
  CONSTRAINT reg_dup_matches_no_self_application
    CHECK (
      matched_record_type <> 'application'
      OR matched_record_id <> application_id
    ),
  CONSTRAINT reg_dup_matches_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT reg_dup_matches_application_target_unique
    UNIQUE (application_id, matched_record_type, matched_record_id)
);

CREATE INDEX IF NOT EXISTS reg_dup_matches_application_score_idx
  ON blessboard.registration_duplicate_matches (
    application_id,
    score DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS reg_dup_matches_application_risk_idx
  ON blessboard.registration_duplicate_matches (
    application_id,
    risk_level,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS reg_dup_matches_pending_review_idx
  ON blessboard.registration_duplicate_matches (application_id, created_at DESC)
  WHERE review_decision IS NULL;

CREATE INDEX IF NOT EXISTS reg_dup_matches_matched_record_idx
  ON blessboard.registration_duplicate_matches (
    matched_record_type,
    matched_record_id
  );
