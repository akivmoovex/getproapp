-- AC-V6: facility-scoped clinic departments (module configuration).
-- Hierarchy: organization → healthcare_organization → facility → department.
-- Soft-deactivate only; never cascade-delete operational history.

CREATE TABLE IF NOT EXISTS activeclinic.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  department_key TEXT NOT NULL,
  department_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT departments_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT departments_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT departments_facility_key_unique
    UNIQUE (facility_id, department_key),
  CONSTRAINT departments_key_format
    CHECK (department_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT departments_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT departments_type_check
    CHECK (
      department_type IN (
        'reception',
        'opd',
        'triage',
        'pharmacy',
        'laboratory',
        'radiology',
        'billing',
        'administration',
        'records',
        'procedure'
      )
    ),
  CONSTRAINT departments_status_check
    CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE activeclinic.departments IS
  'Facility-scoped operational departments for clinic module configuration. Soft-status only.';

CREATE INDEX IF NOT EXISTS departments_facility_status_idx
  ON activeclinic.departments (facility_id, status);

CREATE INDEX IF NOT EXISTS departments_facility_type_status_idx
  ON activeclinic.departments (facility_id, department_type, status);

CREATE INDEX IF NOT EXISTS departments_org_status_idx
  ON activeclinic.departments (organization_id, status);

CREATE INDEX IF NOT EXISTS departments_hco_status_idx
  ON activeclinic.departments (healthcare_organization_id, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_departments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.department_key := lower(trim(NEW.department_key));
  NEW.display_name := trim(NEW.display_name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departments_touch ON activeclinic.departments;
CREATE TRIGGER departments_touch
  BEFORE INSERT OR UPDATE ON activeclinic.departments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_departments();
