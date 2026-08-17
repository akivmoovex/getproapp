-- Persist validated website media bytes for inline clinic image upload.
-- Tenant isolation remains organization_id on platform.website_media.

ALTER TABLE platform.website_media
  ADD COLUMN IF NOT EXISTS payload_bytes BYTEA NULL;
