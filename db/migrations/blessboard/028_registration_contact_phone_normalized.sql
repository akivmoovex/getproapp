-- Registration contact phone normalization + uniqueness (Phase: registration integrity).
-- Adds contact_phone_normalized (E.164 text). Keeps contact_phone as submitted display value.
--
-- Uniqueness occupancy (partial unique index) — one active self-registration per normalized phone:
--   INCLUDE when:
--     application_status IN ('submitted', 'duplicate_review')
--     OR provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
--   EXCLUDE (terminal / abandoned enquiry; phone may be reused):
--     application_status IN ('rejected', 'cancelled')
--     OR (application_status = 'closed' AND provisioning_status = 'not_started')
--
-- Live organization phones: blessboard.church_settings.primary_phone is optional and not
-- populated from public registration contact_phone today — no reliable live-org phone source;
-- this migration does NOT invent a cross-check against live orgs.
--
-- Historical rows: backfill only when contact_phone already matches E.164; leave others NULL
-- and RAISE NOTICE with the count (does not fail deployment).

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS contact_phone_normalized TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_contact_phone_normalized_len;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_contact_phone_normalized_len
    CHECK (
      contact_phone_normalized IS NULL
      OR (
        char_length(contact_phone_normalized) BETWEEN 8 AND 16
        AND contact_phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      )
    );

-- Deterministic backfill: strip common separators only when the result is already E.164.
DO $$
DECLARE
  unnormalized_count INT;
BEGIN
  UPDATE blessboard.platform_church_registration_applications
     SET contact_phone_normalized = regexp_replace(
           regexp_replace(trim(contact_phone), '[^0-9+]', '', 'g'),
           '^00',
           '+'
         ),
         updated_at = updated_at
   WHERE contact_phone_normalized IS NULL
     AND contact_phone IS NOT NULL
     AND regexp_replace(
           regexp_replace(trim(contact_phone), '[^0-9+]', '', 'g'),
           '^00',
           '+'
         ) ~ '^\+[1-9][0-9]{6,14}$';

  SELECT COUNT(*)::int INTO unnormalized_count
    FROM blessboard.platform_church_registration_applications
   WHERE contact_phone_normalized IS NULL;

  RAISE NOTICE
    '028 registration phone: % application row(s) remain without contact_phone_normalized (left null; not fabricated)',
    unnormalized_count;
END $$;

-- One occupying registration per normalized phone (see header status policy).
CREATE UNIQUE INDEX IF NOT EXISTS platform_church_reg_apps_phone_normalized_active_uidx
  ON blessboard.platform_church_registration_applications (contact_phone_normalized)
  WHERE contact_phone_normalized IS NOT NULL
    AND (
      application_status IN ('submitted', 'duplicate_review')
      OR provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
    );

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_phone_normalized_idx
  ON blessboard.platform_church_registration_applications (contact_phone_normalized)
  WHERE contact_phone_normalized IS NOT NULL;
