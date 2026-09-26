-- V2.03 ACN27: facility rooms & spaces (physical inventory inside a facility).
-- Hierarchy: organization → healthcare_organization → facility → room
--            (optional department on the same facility).
-- Does NOT replace B2-10 facilities/departments. Does NOT reuse service_points.
-- No occupancy / scheduling / IoT / bed management.

CREATE TABLE IF NOT EXISTS activeclinic.facility_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  department_id UUID NULL,
  room_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  floor_area TEXT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_rooms_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT facility_rooms_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT facility_rooms_department_fk
    FOREIGN KEY (department_id, healthcare_organization_id)
    REFERENCES activeclinic.departments (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT facility_rooms_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT facility_rooms_facility_code_unique
    UNIQUE (facility_id, room_code),
  CONSTRAINT facility_rooms_code_format
    CHECK (room_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  CONSTRAINT facility_rooms_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT facility_rooms_floor_area_len
    CHECK (floor_area IS NULL OR char_length(floor_area) BETWEEN 1 AND 120),
  CONSTRAINT facility_rooms_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 500),
  CONSTRAINT facility_rooms_type_check
    CHECK (
      room_type IN (
        'consultation',
        'exam',
        'triage',
        'treatment',
        'procedure',
        'specimen_lab',
        'administrative',
        'other'
      )
    ),
  CONSTRAINT facility_rooms_status_check
    CHECK (status IN ('available', 'unavailable', 'inactive'))
);

COMMENT ON TABLE activeclinic.facility_rooms IS
  'ACN27 physical rooms/spaces inside a facility. Optional department. Not B2-10 sites and not reception service_points.';

CREATE INDEX IF NOT EXISTS facility_rooms_facility_status_idx
  ON activeclinic.facility_rooms (facility_id, status);

CREATE INDEX IF NOT EXISTS facility_rooms_org_facility_idx
  ON activeclinic.facility_rooms (organization_id, facility_id);

CREATE INDEX IF NOT EXISTS facility_rooms_department_idx
  ON activeclinic.facility_rooms (department_id)
  WHERE department_id IS NOT NULL;

CREATE OR REPLACE FUNCTION activeclinic.touch_facility_rooms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.room_code := trim(NEW.room_code);
  NEW.display_name := trim(NEW.display_name);
  IF NEW.floor_area IS NOT NULL THEN
    NEW.floor_area := trim(NEW.floor_area);
  END IF;
  IF NEW.description IS NOT NULL THEN
    NEW.description := trim(NEW.description);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facility_rooms_touch ON activeclinic.facility_rooms;
CREATE TRIGGER facility_rooms_touch
  BEFORE INSERT OR UPDATE ON activeclinic.facility_rooms
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_facility_rooms();
