-- AC-V6-C01: registration history and facility associations (not encounters).

CREATE TABLE IF NOT EXISTS activeclinic.patient_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  registration_method TEXT NOT NULL,
  source_reference TEXT NULL,
  registered_by_staff_id UUID NULL,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_registrations_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_registrations_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_registrations_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_registrations_staff_fk
    FOREIGN KEY (registered_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_registrations_method_check
    CHECK (
      registration_method IN (
        'walk_in',
        'referral',
        'transfer_in',
        'outreach',
        'imported',
        'other'
      )
    ),
  CONSTRAINT patient_registrations_source_reference_len
    CHECK (
      source_reference IS NULL
      OR char_length(source_reference) BETWEEN 1 AND 200
    ),
  CONSTRAINT patient_registrations_status_check
    CHECK (status IN ('completed', 'voided'))
);

COMMENT ON TABLE activeclinic.patient_registrations IS
  'Administrative registration events. Does not create encounters or appointments.';

-- One completed initial registration per patient.
CREATE UNIQUE INDEX IF NOT EXISTS patient_registrations_one_initial_uidx
  ON activeclinic.patient_registrations (patient_id)
  WHERE is_initial = true AND status = 'completed';

CREATE INDEX IF NOT EXISTS patient_registrations_patient_idx
  ON activeclinic.patient_registrations (patient_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS patient_registrations_facility_idx
  ON activeclinic.patient_registrations (facility_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS patient_registrations_hco_idx
  ON activeclinic.patient_registrations (healthcare_organization_id, registered_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.patient_facility_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  relationship_type TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_facility_links_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_facility_links_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_facility_links_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_facility_links_relationship_check
    CHECK (
      relationship_type IN (
        'registered_at',
        'seen_at',
        'transferred_to',
        'administrative_link'
      )
    ),
  CONSTRAINT patient_facility_links_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT patient_facility_links_last_after_first
    CHECK (last_seen_at >= first_seen_at)
);

COMMENT ON TABLE activeclinic.patient_facility_links IS
  'Facility visibility associations for patients. Link ≠ clinical encounter.';

CREATE UNIQUE INDEX IF NOT EXISTS patient_facility_links_active_uidx
  ON activeclinic.patient_facility_links (patient_id, facility_id, relationship_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS patient_facility_links_facility_idx
  ON activeclinic.patient_facility_links (facility_id, status);

CREATE INDEX IF NOT EXISTS patient_facility_links_patient_idx
  ON activeclinic.patient_facility_links (patient_id, status);

CREATE INDEX IF NOT EXISTS patient_facility_links_hco_facility_idx
  ON activeclinic.patient_facility_links (healthcare_organization_id, facility_id, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_patient_facility_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_facility_links_touch ON activeclinic.patient_facility_links;
CREATE TRIGGER patient_facility_links_touch
  BEFORE INSERT OR UPDATE ON activeclinic.patient_facility_links
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_patient_facility_links();
