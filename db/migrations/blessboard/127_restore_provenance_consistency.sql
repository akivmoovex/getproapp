ALTER TABLE blessboard.website_publication_versions
  DROP CONSTRAINT IF EXISTS wpv_restoration_consistency;

ALTER TABLE blessboard.website_publication_versions
  ADD CONSTRAINT wpv_restoration_consistency
  CHECK (
    (
      source_type <> 'content_restoration'
      AND source_version_id IS NULL
      AND source_platform_version_id IS NULL
      AND restoration_reason IS NULL
      AND restored_by IS NULL
    )
    OR (
      source_type = 'content_restoration'
      AND restoration_reason IS NOT NULL
      AND restored_by IS NOT NULL
      AND (
        (source_version_id IS NOT NULL AND source_platform_version_id IS NULL)
        OR
        (source_version_id IS NULL AND source_platform_version_id IS NOT NULL)
      )
    )
  );
