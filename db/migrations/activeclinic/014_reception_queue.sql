-- AC-V6-C05: reception/queue foundation (HCO-scoped, append-only status history).

CREATE TABLE IF NOT EXISTS activeclinic.service_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  service_point_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  service_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  accepts_walk_in BOOLEAN NOT NULL DEFAULT true,
  accepts_scheduled BOOLEAN NOT NULL DEFAULT true,
  max_queue_capacity INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_points_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_points_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_points_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT service_points_facility_key_unique
    UNIQUE (facility_id, service_point_key),
  CONSTRAINT service_points_key_len
    CHECK (char_length(service_point_key) BETWEEN 1 AND 64),
  CONSTRAINT service_points_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT service_points_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 300),
  CONSTRAINT service_points_service_type_check
    CHECK (
      service_type IN (
        'general', 'triage', 'consultation', 'laboratory',
        'pharmacy', 'radiology', 'cashier', 'records', 'other'
      )
    ),
  CONSTRAINT service_points_status_check
    CHECK (status IN ('active', 'temporarily_closed', 'inactive')),
  CONSTRAINT service_points_capacity_positive
    CHECK (max_queue_capacity IS NULL OR max_queue_capacity > 0)
);

COMMENT ON TABLE activeclinic.service_points IS
  'HCO/facility-scoped service points for reception queue management.';

CREATE INDEX IF NOT EXISTS service_points_facility_status_idx
  ON activeclinic.service_points (facility_id, status);

CREATE TABLE IF NOT EXISTS activeclinic.queue_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  priority_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  priority_level INTEGER NOT NULL,
  color_code TEXT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT queue_priorities_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_priorities_hco_key_unique
    UNIQUE (healthcare_organization_id, priority_key),
  CONSTRAINT queue_priorities_key_len
    CHECK (char_length(priority_key) BETWEEN 1 AND 64),
  CONSTRAINT queue_priorities_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT queue_priorities_level_range
    CHECK (priority_level BETWEEN 1 AND 999),
  CONSTRAINT queue_priorities_color_len
    CHECK (color_code IS NULL OR char_length(color_code) BETWEEN 1 AND 20),
  CONSTRAINT queue_priorities_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200)
);

COMMENT ON TABLE activeclinic.queue_priorities IS
  'HCO-scoped queue priority definitions. Lower level = higher priority.';

CREATE INDEX IF NOT EXISTS queue_priorities_hco_level_idx
  ON activeclinic.queue_priorities (healthcare_organization_id, priority_level);

CREATE TABLE IF NOT EXISTS activeclinic.reception_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  appointment_id UUID NULL,
  arrival_source TEXT NOT NULL,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by_staff_id UUID NULL,
  check_in_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reception_arrivals_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_arrivals_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_arrivals_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_arrivals_appointment_fk
    FOREIGN KEY (appointment_id, healthcare_organization_id)
    REFERENCES activeclinic.appointments (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_arrivals_checked_in_by_fk
    FOREIGN KEY (checked_in_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_arrivals_source_check
    CHECK (
      arrival_source IN (
        'scheduled_appointment', 'walk_in', 'referral', 'transfer', 'other'
      )
    ),
  CONSTRAINT reception_arrivals_check_in_note_len
    CHECK (check_in_note IS NULL OR char_length(check_in_note) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.reception_arrivals IS
  'Reception check-in event log. Patient required, appointment optional for walk-in.';

CREATE INDEX IF NOT EXISTS reception_arrivals_facility_arrived_idx
  ON activeclinic.reception_arrivals (facility_id, arrived_at DESC);

CREATE INDEX IF NOT EXISTS reception_arrivals_patient_idx
  ON activeclinic.reception_arrivals (patient_id, arrived_at DESC);

CREATE INDEX IF NOT EXISTS reception_arrivals_appointment_idx
  ON activeclinic.reception_arrivals (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activeclinic.queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  service_point_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  arrival_id UUID NOT NULL,
  appointment_id UUID NULL,
  priority_id UUID NULL,
  queue_number INTEGER NOT NULL,
  queue_position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  called_at TIMESTAMPTZ NULL,
  serving_started_at TIMESTAMPTZ NULL,
  serving_staff_id UUID NULL,
  completed_at TIMESTAMPTZ NULL,
  completion_outcome TEXT NULL,
  assigned_room TEXT NULL,
  estimated_wait_minutes INTEGER NULL,
  patient_note TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NULL,
  updated_by_staff_id UUID NULL,
  CONSTRAINT queue_entries_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_service_point_fk
    FOREIGN KEY (service_point_id, healthcare_organization_id)
    REFERENCES activeclinic.service_points (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_arrival_fk
    FOREIGN KEY (arrival_id)
    REFERENCES activeclinic.reception_arrivals (id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_appointment_fk
    FOREIGN KEY (appointment_id, healthcare_organization_id)
    REFERENCES activeclinic.appointments (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_priority_fk
    FOREIGN KEY (priority_id)
    REFERENCES activeclinic.queue_priorities (id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_serving_staff_fk
    FOREIGN KEY (serving_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_created_by_staff_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_updated_by_staff_fk
    FOREIGN KEY (updated_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_entries_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT queue_entries_status_check
    CHECK (
      status IN (
        'waiting', 'called', 'serving', 'paused',
        'completed', 'cancelled', 'left_before_service', 'transferred'
      )
    ),
  CONSTRAINT queue_entries_completion_outcome_check
    CHECK (
      completion_outcome IS NULL OR
      completion_outcome IN (
        'service_completed', 'referred_elsewhere', 'patient_declined',
        'service_unavailable', 'other'
      )
    ),
  CONSTRAINT queue_entries_patient_note_len
    CHECK (patient_note IS NULL OR char_length(patient_note) BETWEEN 1 AND 500),
  CONSTRAINT queue_entries_assigned_room_len
    CHECK (assigned_room IS NULL OR char_length(assigned_room) BETWEEN 1 AND 64),
  CONSTRAINT queue_entries_version_positive
    CHECK (version >= 1),
  CONSTRAINT queue_entries_queue_number_positive
    CHECK (queue_number > 0),
  CONSTRAINT queue_entries_queue_position_positive
    CHECK (queue_position > 0)
);

COMMENT ON TABLE activeclinic.queue_entries IS
  'Active queue entries per service point. Version-controlled for optimistic locking.';

CREATE INDEX IF NOT EXISTS queue_entries_service_point_status_idx
  ON activeclinic.queue_entries (service_point_id, status, queue_position);

CREATE INDEX IF NOT EXISTS queue_entries_facility_status_idx
  ON activeclinic.queue_entries (facility_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS queue_entries_patient_idx
  ON activeclinic.queue_entries (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS queue_entries_arrival_idx
  ON activeclinic.queue_entries (arrival_id);

CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_service_point_number_unique
  ON activeclinic.queue_entries (service_point_id, queue_number)
  WHERE status NOT IN ('completed', 'cancelled', 'left_before_service', 'transferred');

CREATE TABLE IF NOT EXISTS activeclinic.queue_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  queue_entry_id UUID NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  reason_code TEXT NULL,
  note TEXT NULL,
  actor_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT queue_status_events_queue_entry_fk
    FOREIGN KEY (queue_entry_id, healthcare_organization_id)
    REFERENCES activeclinic.queue_entries (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_status_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_status_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT queue_status_events_to_status_check
    CHECK (
      to_status IN (
        'waiting', 'called', 'serving', 'paused',
        'completed', 'cancelled', 'left_before_service', 'transferred'
      )
    ),
  CONSTRAINT queue_status_events_reason_len
    CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 1 AND 80),
  CONSTRAINT queue_status_events_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 300)
);

COMMENT ON TABLE activeclinic.queue_status_events IS
  'Append-only queue status history. No hard deletes.';

CREATE INDEX IF NOT EXISTS queue_status_events_queue_entry_idx
  ON activeclinic.queue_status_events (queue_entry_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.reception_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  arrival_id UUID NULL,
  queue_entry_id UUID NULL,
  patient_id UUID NOT NULL,
  note_text TEXT NOT NULL,
  note_category TEXT NOT NULL DEFAULT 'general',
  is_alert BOOLEAN NOT NULL DEFAULT false,
  created_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reception_notes_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_notes_arrival_fk
    FOREIGN KEY (arrival_id)
    REFERENCES activeclinic.reception_arrivals (id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_notes_queue_entry_fk
    FOREIGN KEY (queue_entry_id, healthcare_organization_id)
    REFERENCES activeclinic.queue_entries (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_notes_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_notes_created_by_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT reception_notes_text_len
    CHECK (char_length(note_text) BETWEEN 1 AND 1000),
  CONSTRAINT reception_notes_category_check
    CHECK (
      note_category IN (
        'general', 'complaint', 'appointment_conflict',
        'payment_issue', 'special_need', 'other'
      )
    )
);

COMMENT ON TABLE activeclinic.reception_notes IS
  'Administrative reception notes. Never contains clinical observations.';

CREATE INDEX IF NOT EXISTS reception_notes_patient_idx
  ON activeclinic.reception_notes (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reception_notes_arrival_idx
  ON activeclinic.reception_notes (arrival_id)
  WHERE arrival_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reception_notes_queue_entry_idx
  ON activeclinic.reception_notes (queue_entry_id)
  WHERE queue_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION activeclinic.touch_service_points()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.service_point_key := lower(trim(NEW.service_point_key));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_points_touch ON activeclinic.service_points;
CREATE TRIGGER service_points_touch
  BEFORE INSERT OR UPDATE ON activeclinic.service_points
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_service_points();

CREATE OR REPLACE FUNCTION activeclinic.touch_queue_entries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_entries_touch ON activeclinic.queue_entries;
CREATE TRIGGER queue_entries_touch
  BEFORE INSERT OR UPDATE ON activeclinic.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_queue_entries();
