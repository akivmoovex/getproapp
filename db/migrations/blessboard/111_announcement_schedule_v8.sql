-- Additive schedule fields for BlessBoard announcements (V7-compatible).
-- Extends status with scheduled/expired; visibility evaluated lazily at read time.
-- No background scheduler. Idempotent. Not applied overnight on hosted DB.

ALTER TABLE blessboard.announcements
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.announcements
  DROP CONSTRAINT IF EXISTS announcements_status_check;

ALTER TABLE blessboard.announcements
  ADD CONSTRAINT announcements_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'expired', 'archived'));

ALTER TABLE blessboard.announcements
  DROP CONSTRAINT IF EXISTS announcements_published_at_consistency;

ALTER TABLE blessboard.announcements
  ADD CONSTRAINT announcements_published_at_consistency
  CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR (status IN ('draft', 'scheduled', 'expired', 'archived'))
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'announcements_timezone_len'
  ) THEN
    ALTER TABLE blessboard.announcements
      ADD CONSTRAINT announcements_timezone_len
      CHECK (char_length(timezone) BETWEEN 1 AND 64);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'announcements_ends_after_starts'
  ) THEN
    ALTER TABLE blessboard.announcements
      ADD CONSTRAINT announcements_ends_after_starts
      CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'announcements_scheduled_requires_start'
  ) THEN
    ALTER TABLE blessboard.announcements
      ADD CONSTRAINT announcements_scheduled_requires_start
      CHECK (status <> 'scheduled' OR starts_at IS NOT NULL);
  END IF;
END $$;
