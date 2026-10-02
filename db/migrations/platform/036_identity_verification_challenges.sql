-- V8 shared email/phone verification challenges (additive, V7-compatible).
-- Stores hashed OTP/secrets only. Does not alter platform.identities semantics.
-- Existing null *_verified_at values remain "legacy_unverified" (never auto-lockout).

CREATE TABLE IF NOT EXISTS platform.identity_verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind TEXT NOT NULL,
  subject_id UUID NOT NULL,
  product_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'account_verification',
  identifier_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  resend_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NULL,
  request_ip_hash TEXT NULL,
  delivery_provider TEXT NOT NULL DEFAULT 'testing_outbox',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identity_verification_challenges_subject_kind_check
    CHECK (subject_kind IN ('platform_identity', 'blessboard_user')),
  CONSTRAINT identity_verification_challenges_product_key_check
    CHECK (product_key IN ('blessboard', 'activeclinic', 'platform')),
  CONSTRAINT identity_verification_challenges_channel_check
    CHECK (channel IN ('phone', 'email')),
  CONSTRAINT identity_verification_challenges_purpose_check
    CHECK (purpose IN (
      'account_verification',
      'identifier_change',
      'sensitive_action'
    )),
  CONSTRAINT identity_verification_challenges_status_check
    CHECK (status IN ('pending', 'verified', 'expired', 'cancelled', 'exhausted')),
  CONSTRAINT identity_verification_challenges_code_hash_len
    CHECK (char_length(code_hash) BETWEEN 32 AND 128),
  CONSTRAINT identity_verification_challenges_attempts_nonneg
    CHECK (attempt_count >= 0 AND max_attempts > 0 AND resend_count >= 0),
  CONSTRAINT identity_verification_challenges_expiry_after_create
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS identity_verification_challenges_subject_idx
  ON platform.identity_verification_challenges (subject_kind, subject_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS identity_verification_challenges_identifier_idx
  ON platform.identity_verification_challenges (channel, identifier_normalized, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS identity_verification_challenges_pending_idx
  ON platform.identity_verification_challenges (status, expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS platform.identity_verification_rate_limits (
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_kind, scope_key),
  CONSTRAINT identity_verification_rate_limits_scope_kind_check
    CHECK (scope_kind IN ('identifier', 'subject', 'ip', 'product')),
  CONSTRAINT identity_verification_rate_limits_attempts_nonneg
    CHECK (attempt_count >= 0)
);

COMMENT ON TABLE platform.identity_verification_challenges IS
  'Shared BB/AC verification challenges. Plaintext OTP/codes are never stored.';
COMMENT ON COLUMN platform.identity_verification_challenges.code_hash IS
  'HMAC-SHA256 of verification code; plaintext never persisted.';
