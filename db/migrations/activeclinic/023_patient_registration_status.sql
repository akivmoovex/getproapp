-- AC-V6: registration completeness for full vs quick registration.
-- Quick-registered patients remain clinically usable; demographics may be incomplete.

ALTER TABLE activeclinic.patients
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'complete';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_registration_status_check'
  ) THEN
    ALTER TABLE activeclinic.patients
      ADD CONSTRAINT patients_registration_status_check
      CHECK (registration_status IN ('complete', 'incomplete'));
  END IF;
END $$;

COMMENT ON COLUMN activeclinic.patients.registration_status IS
  'complete = full registration; incomplete = quick registration pending demographic completion';

CREATE INDEX IF NOT EXISTS patients_org_registration_status_idx
  ON activeclinic.patients (organization_id, registration_status)
  WHERE registration_status = 'incomplete';
