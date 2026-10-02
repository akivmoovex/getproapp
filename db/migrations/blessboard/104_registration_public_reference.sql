-- Public registration reference for success-screen lookup (BB-PLATFORM-01).
-- Stores the opaque BB-* ref shown on /register-church/success; never a database UUID.

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS public_registration_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS platform_church_reg_apps_public_ref_uidx
  ON blessboard.platform_church_registration_applications (public_registration_reference)
  WHERE public_registration_reference IS NOT NULL;
