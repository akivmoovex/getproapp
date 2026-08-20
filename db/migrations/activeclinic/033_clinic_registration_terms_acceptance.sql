-- Versioned Terms of Service / Privacy Policy acceptance on clinic registration.
-- Historical rows remain NULL. New public registrations persist both fields.

ALTER TABLE activeclinic.clinic_registration_applications
  ADD COLUMN IF NOT EXISTS terms_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ NULL;

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_terms_version_len;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_terms_version_len
  CHECK (terms_version IS NULL OR char_length(terms_version) BETWEEN 1 AND 32);

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_privacy_version_len;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_privacy_version_len
  CHECK (privacy_version IS NULL OR char_length(privacy_version) BETWEEN 1 AND 32);

COMMENT ON COLUMN activeclinic.clinic_registration_applications.terms_version IS
  'ActiveClinic Terms of Service version accepted at public registration (YYYY-MM-DD).';
COMMENT ON COLUMN activeclinic.clinic_registration_applications.terms_accepted_at IS
  'When the registering administrator accepted the Terms of Service.';
COMMENT ON COLUMN activeclinic.clinic_registration_applications.privacy_version IS
  'Privacy Policy version acknowledged at public registration (YYYY-MM-DD).';
COMMENT ON COLUMN activeclinic.clinic_registration_applications.privacy_acknowledged_at IS
  'When the registering administrator acknowledged the Privacy Policy.';
