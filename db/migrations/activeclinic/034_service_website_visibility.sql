-- Website listing is independent of public booking eligibility.
-- public_bookable remains the booking/business-rule flag.

ALTER TABLE activeclinic.appointment_service_types
  ADD COLUMN IF NOT EXISTS public_website_visible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN activeclinic.appointment_service_types.public_website_visible IS
  'When true, the service may appear on the public mini-website. Does not make the service bookable.';

UPDATE activeclinic.appointment_service_types
   SET public_website_visible = true
 WHERE public_bookable = true
   AND public_website_visible = false;
