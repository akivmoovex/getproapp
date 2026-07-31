-- Branch website initialization metadata (HQ snapshot → branch-owned).
-- Additive. Does not rewrite CMS rows. Safe when governance table already exists.

ALTER TABLE blessboard.branch_website_governance
  ADD COLUMN IF NOT EXISTS website_initialization_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE blessboard.branch_website_governance
  ADD COLUMN IF NOT EXISTS initialized_from_version_id UUID NULL
    REFERENCES blessboard.website_publication_versions (id)
    ON DELETE SET NULL;

ALTER TABLE blessboard.branch_website_governance
  ADD COLUMN IF NOT EXISTS initialized_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.branch_website_governance
  ADD COLUMN IF NOT EXISTS initialization_error TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bwg_website_initialization_status_check'
       AND conrelid = 'blessboard.branch_website_governance'::regclass
  ) THEN
    ALTER TABLE blessboard.branch_website_governance
      ADD CONSTRAINT bwg_website_initialization_status_check
      CHECK (
        website_initialization_status IN (
          'not_started',
          'initializing',
          'completed',
          'failed'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS bwg_initialization_status_idx
  ON blessboard.branch_website_governance (website_initialization_status);

COMMENT ON COLUMN blessboard.branch_website_governance.website_initialization_status IS
  'Branch website init lifecycle: not_started|initializing|completed|failed.';
COMMENT ON COLUMN blessboard.branch_website_governance.initialized_from_version_id IS
  'HQ publication version used as the snapshot source (nullable when HQ had no published version).';
COMMENT ON COLUMN blessboard.branch_website_governance.initialized_at IS
  'When branch website initialization completed successfully.';
COMMENT ON COLUMN blessboard.branch_website_governance.initialization_error IS
  'Safe short failure reason for admin retry (no secrets/PII payload).';
