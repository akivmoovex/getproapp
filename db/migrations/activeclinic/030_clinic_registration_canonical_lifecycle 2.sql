-- Canonical platform registration lifecycle values for NEW clinic applications.
-- Legacy pending_review / approved rows remain valid and are mapped at read time.
-- Does not rewrite historical application rows.

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_status_check;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_status_check
  CHECK (status IN (
    'submitted',
    'provisioning',
    'review_required',
    'active',
    'rejected',
    'suspended',
    'provision_failed',
    'pending_review',
    'approved',
    'withdrawn',
    'duplicate'
  ));

COMMENT ON COLUMN activeclinic.clinic_registration_applications.status IS
  'Canonical: submitted, provisioning, review_required, active, rejected, suspended, provision_failed. Legacy: pending_review, approved, withdrawn, duplicate.';
