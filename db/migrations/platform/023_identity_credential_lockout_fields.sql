-- AC-V6-08: platform identity credential / lockout fields for ActiveClinic login.
-- Additive. Does not copy BlessBoard password hashes or backfill credentials.

ALTER TABLE platform.identities
  ADD COLUMN IF NOT EXISTS failed_sign_in_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE platform.identities
  ADD COLUMN IF NOT EXISTS sign_in_locked_until TIMESTAMPTZ NULL;

ALTER TABLE platform.identities
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ NULL;

ALTER TABLE platform.identities
  ADD COLUMN IF NOT EXISTS credentials_updated_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'identities_failed_sign_in_count_nonneg'
  ) THEN
    ALTER TABLE platform.identities
      ADD CONSTRAINT identities_failed_sign_in_count_nonneg
      CHECK (failed_sign_in_count >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'identities_sign_in_locked_after_created'
  ) THEN
    ALTER TABLE platform.identities
      ADD CONSTRAINT identities_sign_in_locked_after_created
      CHECK (
        sign_in_locked_until IS NULL
        OR sign_in_locked_until >= created_at
      );
  END IF;
END $$;

COMMENT ON COLUMN platform.identities.failed_sign_in_count IS
  'Failed ActiveClinic / platform password attempts; reset on successful sign-in.';
COMMENT ON COLUMN platform.identities.sign_in_locked_until IS
  'Temporary lockout end time. Distinct from locked_at (manual/admin lock).';
COMMENT ON COLUMN platform.identities.credentials_updated_at IS
  'When password_hash last changed on the platform identity.';
COMMENT ON COLUMN platform.identities.must_change_password IS
  'When true, ActiveClinic allows only password-change and logout until cleared.';

CREATE INDEX IF NOT EXISTS identities_sign_in_locked_until_idx
  ON platform.identities (sign_in_locked_until)
  WHERE sign_in_locked_until IS NOT NULL;
