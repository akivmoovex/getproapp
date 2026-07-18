-- Short-lived single-use auth transfers for tenant-host login (hash only; never raw tokens).
-- Used to hand off authentication from apex to a tenant hostname without shared-domain cookies.

CREATE TABLE IF NOT EXISTS platform.auth_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_token_hash TEXT NOT NULL,
  deployment_code TEXT NOT NULL
    REFERENCES platform.deployments (deployment_code)
    ON DELETE RESTRICT,
  requested_hostname TEXT NOT NULL,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL,
  branch_id UUID NULL,
  user_id UUID NULL,
  purpose TEXT NOT NULL,
  return_path TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  CONSTRAINT auth_transfers_token_hash_unique UNIQUE (transfer_token_hash),
  CONSTRAINT auth_transfers_token_hash_format
    CHECK (transfer_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT auth_transfers_purpose_allowed
    CHECK (purpose = 'tenant_login'),
  CONSTRAINT auth_transfers_hostname_format
    CHECK (requested_hostname = lower(btrim(requested_hostname))
      AND requested_hostname ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
      AND char_length(requested_hostname) BETWEEN 1 AND 253),
  CONSTRAINT auth_transfers_expires_after_created
    CHECK (expires_at > created_at),
  CONSTRAINT auth_transfers_consumed_after_created
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CONSTRAINT auth_transfers_return_path_safe
    CHECK (
      return_path IS NULL
      OR (
        return_path ~ '^/(hq|branch-admin|account)(/.*)?$'
        AND return_path !~ '//'
        AND char_length(return_path) <= 200
      )
    )
);

CREATE INDEX IF NOT EXISTS auth_transfers_deployment_code_idx
  ON platform.auth_transfers (deployment_code);

CREATE INDEX IF NOT EXISTS auth_transfers_expires_at_idx
  ON platform.auth_transfers (expires_at)
  WHERE consumed_at IS NULL;
