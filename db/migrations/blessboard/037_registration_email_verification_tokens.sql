-- Registration email-verification tokens (hash-only; one active sent token per application).
-- No application rollup columns. No plaintext tokens.

CREATE TABLE IF NOT EXISTS blessboard.registration_email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE RESTRICT,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  invalidated_at TIMESTAMPTZ NULL,
  invalidation_reason TEXT NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reg_email_verify_tokens_email_len
    CHECK (char_length(btrim(email)) BETWEEN 3 AND 254),
  CONSTRAINT reg_email_verify_tokens_email_normalized_fmt
    CHECK (
      email_normalized = lower(btrim(email_normalized))
      AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
      AND char_length(email_normalized) BETWEEN 3 AND 254
    ),
  CONSTRAINT reg_email_verify_tokens_token_hash_len
    CHECK (char_length(token_hash) = 64 AND token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT reg_email_verify_tokens_status_check
    CHECK (status IN (
      'sent',
      'verified',
      'expired',
      'replaced'
    )),
  CONSTRAINT reg_email_verify_tokens_expires_after_sent
    CHECK (expires_at > sent_at),
  CONSTRAINT reg_email_verify_tokens_verified_consistency
    CHECK (
      (
        status = 'verified'
        AND verified_at IS NOT NULL
        AND invalidated_at IS NULL
        AND invalidation_reason IS NULL
      )
      OR (
        status <> 'verified'
        AND verified_at IS NULL
      )
    ),
  CONSTRAINT reg_email_verify_tokens_replaced_consistency
    CHECK (
      (
        status = 'replaced'
        AND invalidated_at IS NOT NULL
        AND invalidation_reason IS NOT NULL
        AND char_length(btrim(invalidation_reason)) BETWEEN 1 AND 120
        AND verified_at IS NULL
      )
      OR (status <> 'replaced')
    ),
  CONSTRAINT reg_email_verify_tokens_invalidation_reason_len
    CHECK (
      invalidation_reason IS NULL
      OR char_length(btrim(invalidation_reason)) BETWEEN 1 AND 120
    ),
  CONSTRAINT reg_email_verify_tokens_expired_consistency
    CHECK (
      (
        status = 'expired'
        AND verified_at IS NULL
      )
      OR (status <> 'expired')
    ),
  CONSTRAINT reg_email_verify_tokens_sent_consistency
    CHECK (
      (
        status = 'sent'
        AND verified_at IS NULL
        AND invalidated_at IS NULL
        AND invalidation_reason IS NULL
      )
      OR (status <> 'sent')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS reg_email_verify_tokens_token_hash_uidx
  ON blessboard.registration_email_verification_tokens (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS reg_email_verify_tokens_one_active_sent_uidx
  ON blessboard.registration_email_verification_tokens (application_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS reg_email_verify_tokens_application_created_idx
  ON blessboard.registration_email_verification_tokens (
    application_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS reg_email_verify_tokens_email_normalized_idx
  ON blessboard.registration_email_verification_tokens (email_normalized);
