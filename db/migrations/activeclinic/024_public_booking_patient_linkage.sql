-- AC-V6: public booking → clinic patient linkage states (Option A on booking row).
-- Does not auto-link. Does not merge patients. Organization/HCO scoped.
-- Idempotent. Append-only.

-- ---------------------------------------------------------------------------
-- 1. Linkage status on public_booking_requests
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.public_booking_requests
  ADD COLUMN IF NOT EXISTS patient_link_status TEXT NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS patient_linked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS patient_linked_by_staff_id UUID NULL,
  ADD COLUMN IF NOT EXISTS patient_match_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE activeclinic.public_booking_requests
  DROP CONSTRAINT IF EXISTS public_booking_requests_patient_link_status_check;
ALTER TABLE activeclinic.public_booking_requests
  ADD CONSTRAINT public_booking_requests_patient_link_status_check
  CHECK (
    patient_link_status IN (
      'unlinked',
      'possible_match',
      'link_review_required',
      'linked',
      'new_patient_pending'
    )
  );

ALTER TABLE activeclinic.public_booking_requests
  DROP CONSTRAINT IF EXISTS public_booking_requests_patient_match_count_nonneg;
ALTER TABLE activeclinic.public_booking_requests
  ADD CONSTRAINT public_booking_requests_patient_match_count_nonneg
  CHECK (patient_match_count >= 0);

CREATE INDEX IF NOT EXISTS public_booking_requests_org_link_status_idx
  ON activeclinic.public_booking_requests (organization_id, patient_link_status, created_at DESC);

COMMENT ON COLUMN activeclinic.public_booking_requests.patient_link_status IS
  'Clinic patient linkage: unlinked | possible_match | link_review_required | linked | new_patient_pending. Never auto-linked from phone alone.';

COMMENT ON COLUMN activeclinic.public_booking_requests.patient_id IS
  'Authoritative clinic patient when patient_link_status = linked (or legacy rows). NULL while unresolved.';

-- Portal booking ownership (distinct from clinic patient_id linkage).
ALTER TABLE activeclinic.public_booking_requests
  ADD COLUMN IF NOT EXISTS portal_platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS public_booking_requests_portal_identity_idx
  ON activeclinic.public_booking_requests (organization_id, portal_platform_identity_id)
  WHERE portal_platform_identity_id IS NOT NULL;

COMMENT ON COLUMN activeclinic.public_booking_requests.portal_platform_identity_id IS
  'Portal account that owns this booking for logistics. Does not imply clinic patient linkage.';

-- Backfill: existing rows with patient_id → linked; without → unlinked.
UPDATE activeclinic.public_booking_requests
   SET patient_link_status = CASE
         WHEN patient_id IS NOT NULL THEN 'linked'
         ELSE 'unlinked'
       END,
       patient_linked_at = CASE
         WHEN patient_id IS NOT NULL AND patient_linked_at IS NULL THEN updated_at
         ELSE patient_linked_at
       END
 WHERE patient_link_status = 'unlinked'
    OR (patient_id IS NOT NULL AND patient_link_status <> 'linked');

-- ---------------------------------------------------------------------------
-- 2. Extend portal link event types for booking/patient claim audit
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.patient_portal_link_events
  DROP CONSTRAINT IF EXISTS patient_portal_link_events_event_type_check;
ALTER TABLE activeclinic.patient_portal_link_events
  ADD CONSTRAINT patient_portal_link_events_event_type_check
  CHECK (
    event_type IN (
      'linked_via_guest_token',
      'linked_via_phone_match',
      'link_conflict',
      'profile_updated',
      'login',
      'logout',
      'booking_patient_match_detected',
      'booking_patient_linked',
      'booking_patient_created',
      'portal_booking_linked',
      'patient_claim_confirmed',
      'patient_claim_rejected'
    )
  );
