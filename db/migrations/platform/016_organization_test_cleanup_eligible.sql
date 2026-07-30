-- Marker for testing-data maintenance eligibility.
-- Cleanup must never rely on organization display names alone.
-- Existing preserve-set rules still apply: platform-admin orgs are never deleted.

ALTER TABLE platform.organizations
  ADD COLUMN IF NOT EXISTS test_cleanup_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN platform.organizations.test_cleanup_eligible IS
  'When true, organization may be removed by testing-only maintenance cleanup (still subject to platform-admin preserve set and identity gates).';

-- Backfill known non-production fixture environments so existing test tenants remain eligible.
UPDATE platform.organizations
   SET test_cleanup_eligible = true
 WHERE data_environment IN ('testing', 'demo', 'pilot')
   AND test_cleanup_eligible = false;

CREATE INDEX IF NOT EXISTS organizations_test_cleanup_eligible_idx
  ON platform.organizations (test_cleanup_eligible)
  WHERE test_cleanup_eligible = true;
