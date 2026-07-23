-- Registration phone-verification call attempts (append-only evidence ledger).
-- Separate from organization_support_contacts (CRM). No application rollup columns.

CREATE TABLE IF NOT EXISTS blessboard.registration_phone_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE RESTRICT,
  phone_number_called TEXT NOT NULL,
  phone_number_normalized TEXT NOT NULL,
  contact_person_name TEXT NULL,
  contact_person_role TEXT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL,
  applicant_identity_status TEXT NOT NULL DEFAULT 'not_checked',
  applicant_authority_status TEXT NOT NULL DEFAULT 'not_checked',
  verification_result TEXT NOT NULL DEFAULT 'pending',
  verification_reason TEXT NULL,
  notes TEXT NULL,
  follow_up_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reg_phone_verify_attempts_phone_called_len
    CHECK (char_length(btrim(phone_number_called)) BETWEEN 1 AND 64),
  CONSTRAINT reg_phone_verify_attempts_phone_normalized_fmt
    CHECK (
      char_length(phone_number_normalized) BETWEEN 8 AND 16
      AND phone_number_normalized ~ '^\+[1-9][0-9]{6,14}$'
    ),
  CONSTRAINT reg_phone_verify_attempts_contact_name_len
    CHECK (
      contact_person_name IS NULL
      OR char_length(btrim(contact_person_name)) BETWEEN 1 AND 200
    ),
  CONSTRAINT reg_phone_verify_attempts_contact_role_len
    CHECK (
      contact_person_role IS NULL
      OR char_length(btrim(contact_person_role)) BETWEEN 1 AND 120
    ),
  CONSTRAINT reg_phone_verify_attempts_outcome_check
    CHECK (outcome IN (
      'answered',
      'no_answer',
      'unavailable',
      'wrong_number',
      'callback_requested',
      'information_inconsistent'
    )),
  CONSTRAINT reg_phone_verify_attempts_identity_status_check
    CHECK (applicant_identity_status IN (
      'not_checked',
      'confirmed',
      'not_confirmed'
    )),
  CONSTRAINT reg_phone_verify_attempts_authority_status_check
    CHECK (applicant_authority_status IN (
      'not_checked',
      'confirmed',
      'not_confirmed'
    )),
  CONSTRAINT reg_phone_verify_attempts_verification_result_check
    CHECK (verification_result IN (
      'pending',
      'verified',
      'failed'
    )),
  CONSTRAINT reg_phone_verify_attempts_verification_reason_required
    CHECK (
      verification_result = 'pending'
      OR (
        verification_reason IS NOT NULL
        AND char_length(btrim(verification_reason)) BETWEEN 1 AND 1000
      )
    ),
  CONSTRAINT reg_phone_verify_attempts_verification_reason_len
    CHECK (
      verification_reason IS NULL
      OR char_length(btrim(verification_reason)) BETWEEN 1 AND 1000
    ),
  CONSTRAINT reg_phone_verify_attempts_notes_len
    CHECK (
      notes IS NULL
      OR char_length(notes) BETWEEN 0 AND 5000
    )
);

CREATE INDEX IF NOT EXISTS reg_phone_verify_attempts_application_attempted_idx
  ON blessboard.registration_phone_verification_attempts (
    application_id,
    attempted_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS reg_phone_verify_attempts_follow_up_idx
  ON blessboard.registration_phone_verification_attempts (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS reg_phone_verify_attempts_phone_normalized_idx
  ON blessboard.registration_phone_verification_attempts (phone_number_normalized);
