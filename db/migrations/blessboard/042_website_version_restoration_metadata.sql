-- Phase3 Batch A: restoration-source metadata on publication versions.
-- Additive only; does not rewrite migration 041.

ALTER TABLE blessboard.website_publication_versions
  ADD COLUMN IF NOT EXISTS source_version_id UUID NULL
    REFERENCES blessboard.website_publication_versions (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.website_publication_versions
  ADD COLUMN IF NOT EXISTS restoration_reason TEXT NULL;

ALTER TABLE blessboard.website_publication_versions
  ADD COLUMN IF NOT EXISTS restored_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.website_publication_versions
  DROP CONSTRAINT IF EXISTS wpv_restoration_reason_len;

ALTER TABLE blessboard.website_publication_versions
  ADD CONSTRAINT wpv_restoration_reason_len
  CHECK (
    restoration_reason IS NULL
    OR char_length(btrim(restoration_reason)) BETWEEN 1 AND 2000
  );

ALTER TABLE blessboard.website_publication_versions
  DROP CONSTRAINT IF EXISTS wpv_restoration_consistency;

ALTER TABLE blessboard.website_publication_versions
  ADD CONSTRAINT wpv_restoration_consistency
  CHECK (
    (
      source_type <> 'content_restoration'
      AND source_version_id IS NULL
      AND restoration_reason IS NULL
      AND restored_by IS NULL
    )
    OR (
      source_type = 'content_restoration'
      AND source_version_id IS NOT NULL
      AND restoration_reason IS NOT NULL
      AND restored_by IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS wpv_source_version_idx
  ON blessboard.website_publication_versions (source_version_id)
  WHERE source_version_id IS NOT NULL;
