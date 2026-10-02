-- Tenant-controlled publishing: save draft does not mutate the live version.
-- TENANT_PUBLISH = organisation admins publish explicitly; Platform Admin governs.

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_publish_policy_check;

ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_publish_policy_check
  CHECK (publish_policy IN (
    'AUTO_PUBLISH_WITH_MODERATION',
    'REVIEW_BEFORE_PUBLISH',
    'PLATFORM_LOCKED',
    'TENANT_PUBLISH'
  ));

UPDATE platform.website_instances
   SET publish_policy = 'TENANT_PUBLISH',
       updated_at = now()
 WHERE product_code = 'activeclinic'
   AND publish_policy = 'AUTO_PUBLISH_WITH_MODERATION'
   AND publish_locked IS NOT TRUE;

COMMENT ON COLUMN platform.website_instances.publish_policy IS
  'AUTO_PUBLISH_WITH_MODERATION copies draft to live on save; TENANT_PUBLISH requires an explicit publish; REVIEW_BEFORE_PUBLISH submits for review; PLATFORM_LOCKED blocks tenant publish.';

ALTER TABLE platform.website_versions
  DROP CONSTRAINT IF EXISTS website_versions_source_policy_check;
ALTER TABLE platform.website_versions
  ADD CONSTRAINT website_versions_source_policy_check
  CHECK (
    source_policy IS NULL
    OR source_policy IN (
      'AUTO_PUBLISH_WITH_MODERATION',
      'REVIEW_BEFORE_PUBLISH',
      'PLATFORM_LOCKED',
      'TENANT_PUBLISH',
      'RESTORE'
    )
  );
