-- V2 Bug 19: durable sermon thumbnail for website editor / Content Library.
-- Additive only — does not alter media_url (external A/V link) or resource_url.
ALTER TABLE blessboard.sermons
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sermons_image_url_len'
  ) THEN
    ALTER TABLE blessboard.sermons
      ADD CONSTRAINT sermons_image_url_len
      CHECK (image_url IS NULL OR char_length(image_url) BETWEEN 1 AND 2000);
  END IF;
END $$;
