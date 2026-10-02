-- Prompt 11F: provider-neutral phone OTP verification metadata.
-- Never store plaintext OTP codes or provider secrets in this table.

CREATE TABLE IF NOT EXISTS blessboard.phone_otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  normalized_phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_verification_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  code_hash TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  resend_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  last_attempt_at TIMESTAMPTZ NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip TEXT NULL,
  session_fingerprint TEXT NULL,
  CONSTRAINT phone_otp_verifications_purpose_check
    CHECK (purpose IN (
      'phone_verification',
      'invitation_activation',
      'password_recovery',
      'phone_change',
      'suspicious_login',
      'sensitive_action'
    )),
  CONSTRAINT phone_otp_verifications_status_check
    CHECK (status IN ('pending', 'verified', 'expired', 'cancelled', 'exhausted')),
  CONSTRAINT phone_otp_verifications_provider_check
    CHECK (provider IN ('test', 'infobip', 'twilio')),
  CONSTRAINT phone_otp_verifications_phone_format
    CHECK (
      normalized_phone ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(normalized_phone) BETWEEN 8 AND 20
    ),
  CONSTRAINT phone_otp_verifications_code_hash_len
    CHECK (char_length(code_hash) BETWEEN 32 AND 128),
  CONSTRAINT phone_otp_verifications_attempts_nonneg
    CHECK (attempt_count >= 0 AND max_attempts > 0 AND resend_count >= 0),
  CONSTRAINT phone_otp_verifications_expiry_after_create
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS phone_otp_verifications_phone_purpose_idx
  ON blessboard.phone_otp_verifications (normalized_phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_otp_verifications_org_idx
  ON blessboard.phone_otp_verifications (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS phone_otp_verifications_user_idx
  ON blessboard.phone_otp_verifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS phone_otp_verifications_pending_idx
  ON blessboard.phone_otp_verifications (status, expires_at)
  WHERE status = 'pending';

COMMENT ON TABLE blessboard.phone_otp_verifications IS
  'OTP challenge metadata only. Plaintext codes are never stored.';
COMMENT ON COLUMN blessboard.phone_otp_verifications.code_hash IS
  'HMAC/SHA-256 hash of OTP; plaintext never persisted.';
