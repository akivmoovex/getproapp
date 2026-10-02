-- AC-V6-C03: appointment service types (HCO-scoped scheduling catalogue).

CREATE TABLE IF NOT EXISTS activeclinic.appointment_service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  service_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  requires_assigned_staff BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_service_types_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_service_types_hco_key_unique
    UNIQUE (healthcare_organization_id, service_key),
  CONSTRAINT appointment_service_types_id_hco_unique
    UNIQUE (id, healthcare_organization_id),
  CONSTRAINT appointment_service_types_key_format
    CHECK (service_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT appointment_service_types_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT appointment_service_types_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 500),
  CONSTRAINT appointment_service_types_duration_check
    CHECK (default_duration_minutes BETWEEN 5 AND 480),
  CONSTRAINT appointment_service_types_status_check
    CHECK (status IN ('active', 'inactive', 'archived'))
);

COMMENT ON TABLE activeclinic.appointment_service_types IS
  'HCO-scoped appointment service catalogue. Not clinical procedure coding.';

CREATE INDEX IF NOT EXISTS appointment_service_types_hco_status_idx
  ON activeclinic.appointment_service_types (healthcare_organization_id, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_appointment_service_types()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.service_key := lower(trim(NEW.service_key));
  NEW.display_name := trim(NEW.display_name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_service_types_touch
  ON activeclinic.appointment_service_types;
CREATE TRIGGER appointment_service_types_touch
  BEFORE INSERT OR UPDATE ON activeclinic.appointment_service_types
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_appointment_service_types();
