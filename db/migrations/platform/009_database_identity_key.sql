-- Add explicit database purpose key (distinct from PLATFORM_DEPLOYMENT_CODE).
-- Example: blessboard-platform-v5

ALTER TABLE platform.database_identity
  ADD COLUMN IF NOT EXISTS identity_key TEXT;

ALTER TABLE platform.database_identity
  DROP CONSTRAINT IF EXISTS database_identity_identity_key_format;

ALTER TABLE platform.database_identity
  ADD CONSTRAINT database_identity_identity_key_format
  CHECK (
    identity_key IS NULL
    OR identity_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS database_identity_identity_key_uidx
  ON platform.database_identity (identity_key)
  WHERE identity_key IS NOT NULL;
