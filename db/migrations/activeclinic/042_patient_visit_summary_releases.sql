-- V2.03 AC-P05: patient visit summary releases (explicit clinician release snapshot).
-- Patient portal reads released snapshots only — never raw consultation_notes.
-- Distinct from ACN18 clinical documents. No automatic release on encounter complete.
-- PDF binary storage deferred.

CREATE TABLE IF NOT EXISTS activeclinic.patient_visit_summary_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  snapshot_json JSONB NOT NULL,
  released_by_staff_id UUID NOT NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_visit_summary_releases_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_visit_summary_releases_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_visit_summary_releases_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_visit_summary_releases_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_visit_summary_releases_released_by_fk
    FOREIGN KEY (released_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_visit_summary_releases_id_org_unique
    UNIQUE (id, organization_id),
  CONSTRAINT patient_visit_summary_releases_encounter_unique
    UNIQUE (encounter_id),
  CONSTRAINT patient_visit_summary_releases_snapshot_object
    CHECK (jsonb_typeof(snapshot_json) = 'object')
);

COMMENT ON TABLE activeclinic.patient_visit_summary_releases IS
  'AC-P05 explicit clinician-released patient-safe visit summary snapshots. Immutable per encounter for MVP.';

CREATE INDEX IF NOT EXISTS patient_visit_summary_releases_patient_idx
  ON activeclinic.patient_visit_summary_releases (patient_id, released_at DESC);

CREATE INDEX IF NOT EXISTS patient_visit_summary_releases_org_facility_idx
  ON activeclinic.patient_visit_summary_releases (organization_id, facility_id, released_at DESC);

CREATE OR REPLACE FUNCTION activeclinic.touch_patient_visit_summary_releases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_visit_summary_releases_touch
  ON activeclinic.patient_visit_summary_releases;
CREATE TRIGGER patient_visit_summary_releases_touch
  BEFORE UPDATE ON activeclinic.patient_visit_summary_releases
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_patient_visit_summary_releases();

-- Narrow release permission (PHI projection to patient). Not granted via facility.update.
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.visit_summary.release', 'activeclinic', 'release',
   'Release patient visit summary',
   'Explicitly release a patient-safe visit summary snapshot to the patient portal',
   'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_clinician'
   AND p.permission_key = 'activeclinic.visit_summary.release'
ON CONFLICT DO NOTHING;
