-- AC-V6-04: nullable BlessBoard → platform identity link (additive).
-- Existing users remain valid without a link. No password/hash migration.

ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS platform_identity_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_platform_identity_id_fkey'
  ) THEN
    ALTER TABLE blessboard.users
      ADD CONSTRAINT users_platform_identity_id_fkey
      FOREIGN KEY (platform_identity_id)
      REFERENCES platform.identities (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_platform_identity_id_uidx
  ON blessboard.users (platform_identity_id)
  WHERE platform_identity_id IS NOT NULL;

COMMENT ON COLUMN blessboard.users.platform_identity_id IS
  'Optional link to platform.identities. Null during transition; one BlessBoard profile maps to at most one identity.';
