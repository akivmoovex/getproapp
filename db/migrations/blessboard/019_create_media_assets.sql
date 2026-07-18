-- Media asset metadata only. Binary objects live in object storage (local FS or Supabase Storage).

CREATE TABLE IF NOT EXISTS blessboard.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  uploaded_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ NULL,
  CONSTRAINT media_assets_storage_bucket_len
    CHECK (char_length(storage_bucket) BETWEEN 1 AND 128),
  CONSTRAINT media_assets_storage_key_len
    CHECK (char_length(storage_key) BETWEEN 1 AND 500),
  CONSTRAINT media_assets_original_filename_len
    CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  CONSTRAINT media_assets_mime_type_len
    CHECK (char_length(mime_type) BETWEEN 1 AND 128),
  CONSTRAINT media_assets_size_bytes_range
    CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  CONSTRAINT media_assets_sha256_format
    CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT media_assets_visibility_check
    CHECK (visibility IN ('public', 'private')),
  CONSTRAINT media_assets_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT media_assets_archived_at_consistency
    CHECK (
      (status = 'active' AND archived_at IS NULL)
      OR (status = 'archived' AND archived_at IS NOT NULL)
    ),
  CONSTRAINT media_assets_storage_key_unique UNIQUE (storage_bucket, storage_key)
);

CREATE INDEX IF NOT EXISTS media_assets_church_created_idx
  ON blessboard.media_assets (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_church_sha256_idx
  ON blessboard.media_assets (church_id, sha256)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS media_assets_church_status_idx
  ON blessboard.media_assets (church_id, status);

DROP TRIGGER IF EXISTS media_assets_branch_owns_church ON blessboard.media_assets;
CREATE TRIGGER media_assets_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.media_assets
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

-- Optional image URL columns for ministry / event media (HTTPS or /_bb/media/:id).
ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

ALTER TABLE blessboard.ministries
  DROP CONSTRAINT IF EXISTS ministries_image_url_len;
ALTER TABLE blessboard.ministries
  ADD CONSTRAINT ministries_image_url_len
    CHECK (image_url IS NULL OR char_length(image_url) BETWEEN 1 AND 2000);

ALTER TABLE blessboard.events
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

ALTER TABLE blessboard.events
  DROP CONSTRAINT IF EXISTS events_image_url_len;
ALTER TABLE blessboard.events
  ADD CONSTRAINT events_image_url_len
    CHECK (image_url IS NULL OR char_length(image_url) BETWEEN 1 AND 2000);
