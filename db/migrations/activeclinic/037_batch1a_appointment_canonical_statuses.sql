-- V2.03 Batch 1A appointments: canonical status vocabulary (additive / backward-safe).
-- Remaps legacy statuses into the Stitch lifecycle set used by ACN06–ACN08.

-- ---------------------------------------------------------------------------
-- Expand CHECKs to accept both legacy and canonical values during remap
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE activeclinic.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'requested',
      'confirmed',
      'arrived',
      'waiting',
      'with_practitioner',
      'completed',
      'cancelled',
      'no_show',
      -- legacy (pre-remap / transitional)
      'scheduled',
      'checked_in',
      'in_progress',
      'rescheduled'
    )
  );

ALTER TABLE activeclinic.appointment_status_events
  DROP CONSTRAINT IF EXISTS appointment_status_events_to_status_check;

ALTER TABLE activeclinic.appointment_status_events
  ADD CONSTRAINT appointment_status_events_to_status_check
  CHECK (
    to_status IN (
      'requested',
      'confirmed',
      'arrived',
      'waiting',
      'with_practitioner',
      'completed',
      'cancelled',
      'no_show',
      'scheduled',
      'checked_in',
      'in_progress',
      'rescheduled'
    )
  );

-- Remap live appointment rows
UPDATE activeclinic.appointments
   SET status = 'confirmed', updated_at = now()
 WHERE status = 'scheduled';

UPDATE activeclinic.appointments
   SET status = 'arrived', updated_at = now()
 WHERE status = 'checked_in';

UPDATE activeclinic.appointments
   SET status = 'with_practitioner', updated_at = now()
 WHERE status = 'in_progress';

-- Superseded reschedule rows become cancelled with reason preserved
UPDATE activeclinic.appointments
   SET status = 'cancelled',
       cancellation_reason = COALESCE(cancellation_reason, 'rescheduled'),
       updated_at = now()
 WHERE status = 'rescheduled';

-- Remap history event vocabulary (append-only table; rewrite labels only)
UPDATE activeclinic.appointment_status_events
   SET to_status = 'confirmed'
 WHERE to_status = 'scheduled';

UPDATE activeclinic.appointment_status_events
   SET from_status = 'confirmed'
 WHERE from_status = 'scheduled';

UPDATE activeclinic.appointment_status_events
   SET to_status = 'arrived'
 WHERE to_status = 'checked_in';

UPDATE activeclinic.appointment_status_events
   SET from_status = 'arrived'
 WHERE from_status = 'checked_in';

UPDATE activeclinic.appointment_status_events
   SET to_status = 'with_practitioner'
 WHERE to_status = 'in_progress';

UPDATE activeclinic.appointment_status_events
   SET from_status = 'with_practitioner'
 WHERE from_status = 'in_progress';

UPDATE activeclinic.appointment_status_events
   SET to_status = 'cancelled'
 WHERE to_status = 'rescheduled';

UPDATE activeclinic.appointment_status_events
   SET from_status = 'cancelled'
 WHERE from_status = 'rescheduled';

-- Narrow CHECKs to canonical vocabulary
ALTER TABLE activeclinic.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE activeclinic.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'requested',
      'confirmed',
      'arrived',
      'waiting',
      'with_practitioner',
      'completed',
      'cancelled',
      'no_show'
    )
  );

ALTER TABLE activeclinic.appointment_status_events
  DROP CONSTRAINT IF EXISTS appointment_status_events_to_status_check;

ALTER TABLE activeclinic.appointment_status_events
  ADD CONSTRAINT appointment_status_events_to_status_check
  CHECK (
    to_status IN (
      'requested',
      'confirmed',
      'arrived',
      'waiting',
      'with_practitioner',
      'completed',
      'cancelled',
      'no_show'
    )
  );

ALTER TABLE activeclinic.appointments
  ALTER COLUMN status SET DEFAULT 'confirmed';

COMMENT ON COLUMN activeclinic.appointments.status IS
  'Canonical ACN lifecycle: requested, confirmed, arrived, waiting, with_practitioner, completed, cancelled, no_show.';

-- Booking request decline reason + declined status
ALTER TABLE activeclinic.public_booking_requests
  ADD COLUMN IF NOT EXISTS decline_reason TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'public_booking_requests_decline_reason_len'
  ) THEN
    ALTER TABLE activeclinic.public_booking_requests
      ADD CONSTRAINT public_booking_requests_decline_reason_len
      CHECK (decline_reason IS NULL OR char_length(decline_reason) BETWEEN 1 AND 500);
  END IF;
END $$;

ALTER TABLE activeclinic.public_booking_requests
  DROP CONSTRAINT IF EXISTS public_booking_requests_status_check;

ALTER TABLE activeclinic.public_booking_requests
  ADD CONSTRAINT public_booking_requests_status_check
  CHECK (
    status IN (
      'submitted_pending_confirmation',
      'confirmed',
      'cancelled',
      'declined',
      'expired',
      'unavailable',
      'reschedule_requested',
      'cancellation_requested',
      'completed',
      'no_show'
    )
  );
