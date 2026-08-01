-- Additive: invitation delivery status + user action tokens (password reset).
-- No plaintext tokens. No destructive changes.

ALTER TABLE blessboard.user_invitations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NULL;

ALTER TABLE blessboard.user_invitations
  ADD COLUMN IF NOT EXISTS delivery_attempted_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.user_invitations
  ADD COLUMN IF NOT EXISTS delivery_error_code TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_invitations_delivery_status_check'
       AND conrelid = 'blessboard.user_invitations'::regclass
  ) THEN
    ALTER TABLE blessboard.user_invitations
      ADD CONSTRAINT user_invitations_delivery_status_check
        CHECK (
          delivery_status IS NULL
          OR delivery_status IN (
            'sent',
            'sending_unavailable',
            'failed',
            'skipped'
          )
        );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_invitations_delivery_error_code_len'
       AND conrelid = 'blessboard.user_invitations'::regclass
  ) THEN
    ALTER TABLE blessboard.user_invitations
      ADD CONSTRAINT user_invitations_delivery_error_code_len
        CHECK (
          delivery_error_code IS NULL
          OR char_length(btrim(delivery_error_code)) BETWEEN 1 AND 80
        );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS blessboard.user_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE SET NULL,
  church_id UUID NULL
    REFERENCES blessboard.churches (id)
    ON DELETE SET NULL,
  request_ip_hash TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_action_tokens_purpose_check
    CHECK (purpose IN ('password_reset')),
  CONSTRAINT user_action_tokens_token_hash_len
    CHECK (char_length(token_hash) = 64 AND token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT user_action_tokens_request_ip_hash_len
    CHECK (
      request_ip_hash IS NULL
      OR char_length(request_ip_hash) = 64
    ),
  CONSTRAINT user_action_tokens_consumed_after_created
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CONSTRAINT user_action_tokens_expires_after_created
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_action_tokens_token_hash_uidx
  ON blessboard.user_action_tokens (token_hash);

CREATE INDEX IF NOT EXISTS user_action_tokens_user_purpose_idx
  ON blessboard.user_action_tokens (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS user_action_tokens_active_idx
  ON blessboard.user_action_tokens (purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS blessboard.password_reset_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_rate_limits_scope_kind_check
    CHECK (scope_kind IN ('email', 'ip')),
  CONSTRAINT password_reset_rate_limits_scope_key_len
    CHECK (char_length(scope_key) BETWEEN 8 AND 128),
  CONSTRAINT password_reset_rate_limits_attempt_count_check
    CHECK (attempt_count >= 0 AND attempt_count <= 100000)
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_rate_limits_scope_uidx
  ON blessboard.password_reset_rate_limits (scope_kind, scope_key);
