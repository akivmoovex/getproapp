ALTER TABLE blessboard.website_publication_versions
  ADD COLUMN IF NOT EXISTS source_platform_version_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'website_publication_versions_source_platform_fk'
  ) THEN
    ALTER TABLE blessboard.website_publication_versions
      ADD CONSTRAINT website_publication_versions_source_platform_fk
      FOREIGN KEY (source_platform_version_id)
      REFERENCES platform.website_versions(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
