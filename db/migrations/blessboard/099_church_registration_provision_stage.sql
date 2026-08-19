-- Persist the last incomplete church provisioning stage for safe Platform Admin retry.
-- Admin-only column. Public registration INSERT/RETURNING must not depend on it.

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS last_provision_stage TEXT NULL;

COMMENT ON COLUMN blessboard.platform_church_registration_applications.last_provision_stage IS
  'Canonical incomplete stage: organization, administrator, role_assignment, facility_hq, memberships, default_departments, website_instance, template_content, audit_completion.';
