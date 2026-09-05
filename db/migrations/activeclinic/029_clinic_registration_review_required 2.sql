-- Auto-registration: exceptional holds use review_required.
-- pending_review remains for legacy rows and in-flight follow-up.
-- Does not auto-activate existing pending applications.

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_status_check;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_status_check
  CHECK (status IN (
    'pending_review',
    'review_required',
    'approved',
    'rejected',
    'withdrawn',
    'duplicate'
  ));

COMMENT ON TABLE activeclinic.clinic_registration_applications IS
  'Public clinic onboarding applications. Normal registrations auto-provision; review_required is exceptional.';

COMMENT ON COLUMN activeclinic.clinic_registration_applications.status IS
  'pending_review=legacy/in-flight review; review_required=exceptional hold; approved=provisioned or provisioning.';
