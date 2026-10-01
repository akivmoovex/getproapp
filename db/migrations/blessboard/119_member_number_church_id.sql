-- V2.04 Phase 3 — BlessBoard staff-managed Church ID / member number (additive).
-- Human-facing member identifier within a church. Not platform.identities.
-- Nullable for legacy rows; unique among live members when present.

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS member_number TEXT NULL;

COMMENT ON COLUMN blessboard.members.member_number IS
  'V2.04 Church ID / member number (staff-managed). Unique per church when set.';

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_member_number_len;

ALTER TABLE blessboard.members
  ADD CONSTRAINT members_member_number_len
  CHECK (
    member_number IS NULL
    OR char_length(trim(member_number)) BETWEEN 1 AND 64
  );

CREATE UNIQUE INDEX IF NOT EXISTS members_church_member_number_live_uidx
  ON blessboard.members (church_id, lower(trim(member_number)))
  WHERE member_number IS NOT NULL
    AND status IN ('pending', 'active', 'inactive', 'suspended');

-- Reversal (manual):
--   DROP INDEX IF EXISTS blessboard.members_church_member_number_live_uidx;
--   ALTER TABLE blessboard.members DROP CONSTRAINT IF EXISTS members_member_number_len;
--   ALTER TABLE blessboard.members DROP COLUMN IF EXISTS member_number;
