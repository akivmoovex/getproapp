-- NOT APPLIED.
-- Reviewed source for a later operator approval.
-- Do not copy this file to db/migrations/platform/048_otp_challenges.sql.
-- Contract tests require that path to stay absent.
-- Do not run this script in G181. It does not create platform.otp_challenges.

CREATE TABLE platform.otp_challenges (
  id uuid PRIMARY KEY,
  product_code text NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id),
  account_id uuid NOT NULL,
  session_id uuid NULL,
  attempt_id uuid NOT NULL,
  action text NOT NULL,
  purpose text NOT NULL,
  channel text NOT NULL,
  identifier_hash text NOT NULL,
  code_hash text NOT NULL,
  context_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  CONSTRAINT otp_challenges_product_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT otp_challenges_channel_check
    CHECK (channel IN ('email', 'sms')),
  CONSTRAINT otp_challenges_status_check
    CHECK (status IN ('pending', 'verified', 'expired', 'cancelled', 'exhausted')),
  CONSTRAINT otp_challenges_attempts_check
    CHECK (attempt_count >= 0 AND attempt_count <= 5 AND max_attempts = 5),
  CONSTRAINT otp_challenges_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT otp_challenges_hash_len_check
    CHECK (
      char_length(code_hash) = 64
      AND char_length(identifier_hash) = 64
      AND char_length(context_hash) = 64
    ),
  CONSTRAINT otp_challenges_verified_check
    CHECK (
      (status = 'verified' AND verified_at IS NOT NULL)
      OR (status <> 'verified' AND verified_at IS NULL)
    )
);

CREATE UNIQUE INDEX otp_challenges_attempt_uidx
  ON platform.otp_challenges (attempt_id);

CREATE INDEX otp_challenges_pending_idx
  ON platform.otp_challenges (
    product_code, organization_id, account_id, purpose, channel, status, expires_at
  );

CREATE TABLE platform.otp_rate_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL,
  CONSTRAINT otp_rate_buckets_count_check CHECK (attempt_count >= 0)
);

COMMENT ON TABLE platform.otp_challenges IS
  'OTP hashes and bindings only. No plaintext code, email, or phone.';
