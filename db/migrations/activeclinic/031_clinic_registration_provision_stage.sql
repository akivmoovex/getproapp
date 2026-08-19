-- Persist the last incomplete clinic provisioning stage for safe Platform Admin retry.
-- Does not rewrite historical application rows.

ALTER TABLE activeclinic.clinic_registration_applications
  ADD COLUMN IF NOT EXISTS last_provision_stage TEXT NULL;

COMMENT ON COLUMN activeclinic.clinic_registration_applications.last_provision_stage IS
  'Canonical incomplete stage: organization, administrator, role_assignment, facility_hq, memberships, default_departments, website_instance, template_content, audit_completion.';
