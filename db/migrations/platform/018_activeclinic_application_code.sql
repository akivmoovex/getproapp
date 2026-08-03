-- Allow ActiveClinic as a platform deployment application_code (additive).
-- Preserves existing allowed values: blessboard, getpro, ngo, platform.

ALTER TABLE platform.deployments
  DROP CONSTRAINT IF EXISTS deployments_application_code_check;

ALTER TABLE platform.deployments
  ADD CONSTRAINT deployments_application_code_check
    CHECK (application_code IN ('blessboard', 'getpro', 'ngo', 'platform', 'activeclinic'));
