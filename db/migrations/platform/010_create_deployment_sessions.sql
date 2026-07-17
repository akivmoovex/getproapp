-- Deployment-scoped V5 session store. Never stores raw session tokens (hash only).
-- Cross-schema FKs to blessboard.users/churches/branches are added in blessboard/006
-- because platform migrations run before blessboard migrations.

CREATE TABLE IF NOT EXISTS platform.deployment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token_hash TEXT NOT NULL,
  deployment_code TEXT NOT NULL
    REFERENCES platform.deployments (deployment_code)
    ON DELETE RESTRICT,
  user_id UUID NULL,
  organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NULL,
  branch_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  CONSTRAINT deployment_sessions_token_hash_unique UNIQUE (session_token_hash),
  CONSTRAINT deployment_sessions_token_hash_format
    CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT deployment_sessions_expires_after_created
    CHECK (expires_at > created_at),
  CONSTRAINT deployment_sessions_revoked_after_created
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT deployment_sessions_last_seen_after_created
    CHECK (last_seen_at >= created_at),
  CONSTRAINT deployment_sessions_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT deployment_sessions_ua_hash_format
    CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS deployment_sessions_deployment_code_idx
  ON platform.deployment_sessions (deployment_code);

CREATE INDEX IF NOT EXISTS deployment_sessions_user_id_idx
  ON platform.deployment_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deployment_sessions_expires_at_idx
  ON platform.deployment_sessions (expires_at)
  WHERE revoked_at IS NULL;
