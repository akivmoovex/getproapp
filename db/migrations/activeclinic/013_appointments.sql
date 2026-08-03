-- AC-V6-C03: appointments + append-only status history (no encounters).

CREATE TABLE IF NOT EXISTS activeclinic.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  service_type_id UUID NOT NULL,
  assigned_staff_id UUID NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduling_note TEXT NULL,
  cancellation_reason TEXT NULL,
  rescheduled_from_appointment_id UUID NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NULL,
  updated_by_staff_id UUID NULL,
  CONSTRAINT appointments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_service_type_fk
    FOREIGN KEY (service_type_id, healthcare_organization_id)
    REFERENCES activeclinic.appointment_service_types (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_assigned_staff_fk
    FOREIGN KEY (assigned_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_created_by_staff_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_updated_by_staff_fk
    FOREIGN KEY (updated_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT appointments_starts_before_ends
    CHECK (starts_at < ends_at),
  CONSTRAINT appointments_timezone_len
    CHECK (char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT appointments_status_check
    CHECK (
      status IN (
        'scheduled',
        'confirmed',
        'checked_in',
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
        'rescheduled'
      )
    ),
  CONSTRAINT appointments_scheduling_note_len
    CHECK (scheduling_note IS NULL OR char_length(scheduling_note) BETWEEN 1 AND 500),
  CONSTRAINT appointments_cancellation_reason_len
    CHECK (
      cancellation_reason IS NULL
      OR char_length(cancellation_reason) BETWEEN 1 AND 200
    ),
  CONSTRAINT appointments_version_positive
    CHECK (version >= 1)
);

ALTER TABLE activeclinic.appointments
  DROP CONSTRAINT IF EXISTS appointments_rescheduled_from_fk;
ALTER TABLE activeclinic.appointments
  ADD CONSTRAINT appointments_rescheduled_from_fk
    FOREIGN KEY (rescheduled_from_appointment_id, healthcare_organization_id)
    REFERENCES activeclinic.appointments (id, healthcare_organization_id)
    ON DELETE RESTRICT;

COMMENT ON TABLE activeclinic.appointments IS
  'HCO/facility-scoped administrative appointments. Does not create clinical encounters.';

CREATE INDEX IF NOT EXISTS appointments_hco_starts_idx
  ON activeclinic.appointments (healthcare_organization_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_facility_starts_idx
  ON activeclinic.appointments (facility_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_patient_idx
  ON activeclinic.appointments (patient_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS appointments_staff_starts_idx
  ON activeclinic.appointments (assigned_staff_id, starts_at)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_hco_status_idx
  ON activeclinic.appointments (healthcare_organization_id, status);

CREATE TABLE IF NOT EXISTS activeclinic.appointment_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  reason_code TEXT NULL,
  note TEXT NULL,
  actor_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_status_events_appointment_fk
    FOREIGN KEY (appointment_id, healthcare_organization_id)
    REFERENCES activeclinic.appointments (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_status_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_status_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_status_events_to_status_check
    CHECK (
      to_status IN (
        'scheduled',
        'confirmed',
        'checked_in',
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
        'rescheduled'
      )
    ),
  CONSTRAINT appointment_status_events_reason_len
    CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 1 AND 80),
  CONSTRAINT appointment_status_events_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 300)
);

COMMENT ON TABLE activeclinic.appointment_status_events IS
  'Append-only appointment status history. No hard deletes.';

CREATE INDEX IF NOT EXISTS appointment_status_events_appointment_idx
  ON activeclinic.appointment_status_events (appointment_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.appointment_reminder_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  preferred_channel TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'not_requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_reminder_requests_appointment_fk
    FOREIGN KEY (appointment_id, healthcare_organization_id)
    REFERENCES activeclinic.appointments (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_reminder_requests_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_reminder_requests_channel_check
    CHECK (preferred_channel IN ('phone', 'sms', 'email', 'none')),
  CONSTRAINT appointment_reminder_requests_delivery_state_check
    CHECK (
      delivery_state IN (
        'not_requested',
        'queued',
        'unavailable',
        'failed'
      )
    )
);

COMMENT ON TABLE activeclinic.appointment_reminder_requests IS
  'Reminder metadata only. No external SMS/email delivery; never marks sent.';

CREATE INDEX IF NOT EXISTS appointment_reminder_requests_appointment_idx
  ON activeclinic.appointment_reminder_requests (appointment_id);

CREATE OR REPLACE FUNCTION activeclinic.touch_appointments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.timezone := trim(NEW.timezone);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_touch ON activeclinic.appointments;
CREATE TRIGGER appointments_touch
  BEFORE INSERT OR UPDATE ON activeclinic.appointments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_appointments();
