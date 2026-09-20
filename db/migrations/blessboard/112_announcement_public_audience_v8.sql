-- Additive V8: public website audience for BlessBoard announcements (BB21–BB22).
-- Backward-compatible: existing members/admins audiences unchanged.
-- Idempotent. Not applied overnight on hosted DB.

ALTER TABLE blessboard.announcement_audiences
  DROP CONSTRAINT IF EXISTS announcement_audiences_key_check;

ALTER TABLE blessboard.announcement_audiences
  ADD CONSTRAINT announcement_audiences_key_check
  CHECK (audience_key IN ('members', 'admins', 'public'));
