-- AC-V6-07: transitional session / auth-transfer principals.
-- Additive. No backfill. Existing BlessBoard rows remain valid.

-- ---------------------------------------------------------------------------
-- deployment_sessions: require at least one principal
-- user_id already nullable; platform_identity_id added in 020.
-- ---------------------------------------------------------------------------
ALTER TABLE platform.deployment_sessions
  DROP CONSTRAINT IF EXISTS deployment_sessions_principal_present;

ALTER TABLE platform.deployment_sessions
  ADD CONSTRAINT deployment_sessions_principal_present
  CHECK (user_id IS NOT NULL OR platform_identity_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS deployment_sessions_deployment_identity_idx
  ON platform.deployment_sessions (deployment_code, platform_identity_id)
  WHERE platform_identity_id IS NOT NULL AND revoked_at IS NULL;

COMMENT ON CONSTRAINT deployment_sessions_principal_present
  ON platform.deployment_sessions IS
  'Transitional: BlessBoard user_id, ActiveClinic platform_identity_id, or linked dual principal.';

-- ---------------------------------------------------------------------------
-- auth_transfers: platform identity principal + nullable church for AC
-- Pending transfers may still have both principals null until authenticated.
-- ---------------------------------------------------------------------------
ALTER TABLE platform.auth_transfers
  ADD COLUMN IF NOT EXISTS platform_identity_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'auth_transfers_platform_identity_id_fkey'
  ) THEN
    ALTER TABLE platform.auth_transfers
      ADD CONSTRAINT auth_transfers_platform_identity_id_fkey
      FOREIGN KEY (platform_identity_id)
      REFERENCES platform.identities (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE platform.auth_transfers
  ALTER COLUMN church_id DROP NOT NULL;

ALTER TABLE platform.auth_transfers
  DROP CONSTRAINT IF EXISTS auth_transfers_purpose_allowed;

ALTER TABLE platform.auth_transfers
  ADD CONSTRAINT auth_transfers_purpose_allowed
    CHECK (purpose IN ('tenant_login', 'activeclinic_login'));

CREATE INDEX IF NOT EXISTS auth_transfers_platform_identity_id_idx
  ON platform.auth_transfers (platform_identity_id)
  WHERE platform_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_transfers_deployment_identity_idx
  ON platform.auth_transfers (deployment_code, platform_identity_id)
  WHERE platform_identity_id IS NOT NULL AND consumed_at IS NULL;

COMMENT ON COLUMN platform.auth_transfers.platform_identity_id IS
  'ActiveClinic / platform-identity transfer principal. BlessBoard continues to use user_id.';
COMMENT ON COLUMN platform.auth_transfers.church_id IS
  'Nullable for ActiveClinic transfers; required by BlessBoard tenant_login application logic.';

