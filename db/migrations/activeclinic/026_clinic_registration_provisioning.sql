-- Link clinic registration applications to provisioned clinic + website.
-- Does not auto-publish the public website.

ALTER TABLE activeclinic.clinic_registration_applications
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS healthcare_organization_id UUID NULL,
  ADD COLUMN IF NOT EXISTS facility_id UUID NULL,
  ADD COLUMN IF NOT EXISTS website_instance_id UUID NULL,
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS clinic_admin_staff_id UUID NULL,
  ADD COLUMN IF NOT EXISTS last_provision_error TEXT NULL;

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_provisioning_status_check;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_provisioning_status_check
  CHECK (provisioning_status IN (
    'not_started', 'in_progress', 'website_pending', 'provisioned', 'failed'
  ));

CREATE INDEX IF NOT EXISTS clinic_registration_applications_org_idx
  ON activeclinic.clinic_registration_applications (organization_id)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN activeclinic.clinic_registration_applications.provisioning_status IS
  'Idempotent clinic+website provision progress. website_pending means core clinic exists and website retry is safe.';
