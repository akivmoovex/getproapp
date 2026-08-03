-- AC-V6-09: platform identity action tokens (activation + password reset).
-- Additive only. Independent of blessboard.user_action_tokens (users FK).
-- Rollback: DROP TABLE platform.identity_action_token_rate_limits;
--           DROP TABLE platform.identity_action_tokens;

CREATE TABLE IF NOT EXISTS platform.identity_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_identity_id UUID NOT NULL
    REFERENCES platform.identities (id)
    ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  deployment_code TEXT NOT NULL,
  product_key TEXT NOT NULL,
  organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE SET NULL,
  staff_member_id UUID NULL,
  request_ip_hash TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT identity_action_tokens_purpose_check
    CHECK (
      purpose IN (
        'activeclinic_staff_activation',
        'activeclinic_password_reset'
      )
    ),
  CONSTRAINT identity_action_tokens_product_key_check
    CHECK (product_key IN ('activeclinic')),
  CONSTRAINT identity_action_tokens_deployment_code_len
    CHECK (char_length(deployment_code) BETWEEN 3 AND 64),
  CONSTRAINT identity_action_tokens_token_hash_len
    CHECK (char_length(token_hash) = 64 AND token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT identity_action_tokens_request_ip_hash_len
    CHECK (
      request_ip_hash IS NULL
      OR char_length(request_ip_hash) = 64
    ),
  CONSTRAINT identity_action_tokens_consumed_after_created
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CONSTRAINT identity_action_tokens_revoked_after_created
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT identity_action_tokens_expires_after_created
    CHECK (expires_at > created_at)
);

COMMENT ON TABLE platform.identity_action_tokens IS
  'One-time hashed action tokens bound to platform identities (not blessboard.users).';

CREATE UNIQUE INDEX IF NOT EXISTS identity_action_tokens_token_hash_uidx
  ON platform.identity_action_tokens (token_hash);

CREATE INDEX IF NOT EXISTS identity_action_tokens_identity_purpose_idx
  ON platform.identity_action_tokens (
    platform_identity_id, purpose, created_at DESC
  );

CREATE INDEX IF NOT EXISTS identity_action_tokens_active_idx
  ON platform.identity_action_tokens (purpose, deployment_code, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS identity_action_tokens_staff_idx
  ON platform.identity_action_tokens (staff_member_id, purpose, created_at DESC)
  WHERE staff_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.identity_action_token_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identity_action_token_rate_limits_scope_kind_check
    CHECK (scope_kind IN ('identifier', 'ip')),
  CONSTRAINT identity_action_token_rate_limits_scope_key_len
    CHECK (char_length(scope_key) BETWEEN 8 AND 128),
  CONSTRAINT identity_action_token_rate_limits_attempt_count_check
    CHECK (attempt_count >= 0 AND attempt_count <= 100000)
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_action_token_rate_limits_scope_uidx
  ON platform.identity_action_token_rate_limits (scope_kind, scope_key);
