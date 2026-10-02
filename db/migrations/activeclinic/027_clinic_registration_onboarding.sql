-- Public clinic onboarding: street address + hashed administrator password.
-- Password hash is never rendered; cleared after successful provision.

ALTER TABLE activeclinic.clinic_registration_applications
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS administrator_password_hash TEXT NULL;

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_address_len;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_address_len
  CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 300);

COMMENT ON COLUMN activeclinic.clinic_registration_applications.address IS
  'Optional street address from public /register-clinic.';

COMMENT ON COLUMN activeclinic.clinic_registration_applications.administrator_password_hash IS
  'bcrypt hash of the administrator password collected at registration. Never returned to views. Cleared after provision.';
