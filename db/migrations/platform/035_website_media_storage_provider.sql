-- Website media: Hostinger filesystem provider metadata (bytes leave PostgreSQL for new uploads).
-- Existing rows keep storage_provider='database' and payload_bytes delivery.

ALTER TABLE platform.website_media
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'database';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'website_media_storage_provider_check'
       AND conrelid = 'platform.website_media'::regclass
  ) THEN
    ALTER TABLE platform.website_media
      ADD CONSTRAINT website_media_storage_provider_check
      CHECK (storage_provider IN ('database', 'hostinger', 'external'));
  END IF;
END $$;

COMMENT ON COLUMN platform.website_media.storage_provider IS
  'database=payload_bytes; hostinger=MEDIA_STORAGE_ROOT object; external=reserved';
