-- Additive email verification timestamp for BlessBoard users (V8 shared verification).
-- Null remains legacy_unverified — never auto-lock existing accounts.

ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN blessboard.users.email_verified_at IS
  'Set only after successful email verification. Null = legacy/unverified (not locked out).';
