-- AC-V6-P06: laboratory/radiology fulfillment, specimens, results, verifications.
-- Extends clinical_orders (laboratory/radiology types) with full diagnostic workflow.
-- Append-only results; no deletes on released data; amendments tracked separately.

CREATE TABLE IF NOT EXISTS activeclinic.laboratory_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  clinical_order_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  request_number TEXT NOT NULL,
  test_panel_code TEXT NULL,
  test_panel_name TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'routine',
  clinical_notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_collection',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ NULL,
  resulted_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  requested_by_staff_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_requests_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_order_fk
    FOREIGN KEY (clinical_order_id)
    REFERENCES activeclinic.clinical_orders (id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_requested_by_fk
    FOREIGN KEY (requested_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_requests_facility_number_unique
    UNIQUE (facility_id, request_number),
  CONSTRAINT laboratory_requests_status_check
    CHECK (
      status IN (
        'pending_collection', 'collected', 'received', 'processing',
        'resulted', 'verified', 'released', 'rejected', 'cancelled'
      )
    ),
  CONSTRAINT laboratory_requests_urgency_check
    CHECK (urgency IN ('routine', 'urgent', 'stat')),
  CONSTRAINT laboratory_requests_number_len
    CHECK (char_length(request_number) BETWEEN 1 AND 64),
  CONSTRAINT laboratory_requests_panel_code_len
    CHECK (test_panel_code IS NULL OR char_length(test_panel_code) BETWEEN 1 AND 64),
  CONSTRAINT laboratory_requests_panel_name_len
    CHECK (char_length(test_panel_name) BETWEEN 1 AND 500),
  CONSTRAINT laboratory_requests_clinical_notes_len
    CHECK (clinical_notes IS NULL OR char_length(clinical_notes) BETWEEN 1 AND 2000),
  CONSTRAINT laboratory_requests_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.laboratory_requests IS
  'Laboratory test requests linked to clinical_orders. Tracks collection → result → verification.';

CREATE INDEX IF NOT EXISTS laboratory_requests_facility_status_idx
  ON activeclinic.laboratory_requests (facility_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS laboratory_requests_encounter_idx
  ON activeclinic.laboratory_requests (encounter_id);

CREATE INDEX IF NOT EXISTS laboratory_requests_patient_idx
  ON activeclinic.laboratory_requests (patient_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS laboratory_requests_order_idx
  ON activeclinic.laboratory_requests (clinical_order_id);

CREATE TABLE IF NOT EXISTS activeclinic.specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  laboratory_request_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  specimen_identifier TEXT NOT NULL,
  specimen_type TEXT NOT NULL,
  collection_method TEXT NULL,
  collection_site TEXT NULL,
  collected_at TIMESTAMPTZ NULL,
  collected_by_staff_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT specimens_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimens_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimens_laboratory_request_fk
    FOREIGN KEY (laboratory_request_id)
    REFERENCES activeclinic.laboratory_requests (id)
    ON DELETE RESTRICT,
  CONSTRAINT specimens_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimens_collected_by_fk
    FOREIGN KEY (collected_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimens_facility_identifier_unique
    UNIQUE (facility_id, specimen_identifier),
  CONSTRAINT specimens_type_check
    CHECK (
      specimen_type IN (
        'blood', 'urine', 'stool', 'sputum', 'csf', 'tissue', 'swab', 'other'
      )
    ),
  CONSTRAINT specimens_status_check
    CHECK (status IN ('pending', 'collected', 'received', 'processing', 'completed', 'rejected')),
  CONSTRAINT specimens_identifier_len
    CHECK (char_length(specimen_identifier) BETWEEN 1 AND 64),
  CONSTRAINT specimens_method_len
    CHECK (collection_method IS NULL OR char_length(collection_method) BETWEEN 1 AND 200),
  CONSTRAINT specimens_site_len
    CHECK (collection_site IS NULL OR char_length(collection_site) BETWEEN 1 AND 200)
);

COMMENT ON TABLE activeclinic.specimens IS
  'Physical specimens collected for laboratory testing. Status tracked via specimen_events.';

CREATE INDEX IF NOT EXISTS specimens_laboratory_request_idx
  ON activeclinic.specimens (laboratory_request_id);

CREATE INDEX IF NOT EXISTS specimens_facility_status_idx
  ON activeclinic.specimens (facility_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS specimens_patient_idx
  ON activeclinic.specimens (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.specimen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  specimen_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_note TEXT NULL,
  rejection_reason TEXT NULL,
  actor_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT specimen_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimen_events_specimen_fk
    FOREIGN KEY (specimen_id)
    REFERENCES activeclinic.specimens (id)
    ON DELETE RESTRICT,
  CONSTRAINT specimen_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT specimen_events_type_check
    CHECK (event_type IN ('collected', 'received', 'processing_started', 'completed', 'rejected')),
  CONSTRAINT specimen_events_note_len
    CHECK (event_note IS NULL OR char_length(event_note) BETWEEN 1 AND 1000),
  CONSTRAINT specimen_events_rejection_reason_len
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.specimen_events IS
  'Append-only specimen lifecycle events. No deletes.';

CREATE INDEX IF NOT EXISTS specimen_events_specimen_created_idx
  ON activeclinic.specimen_events (specimen_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.laboratory_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  laboratory_request_id UUID NOT NULL,
  specimen_id UUID NULL,
  patient_id UUID NOT NULL,
  result_summary TEXT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  resulted_at TIMESTAMPTZ NULL,
  entered_by_staff_id UUID NOT NULL,
  verified_by_staff_id UUID NULL,
  verified_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_results_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_laboratory_request_fk
    FOREIGN KEY (laboratory_request_id)
    REFERENCES activeclinic.laboratory_requests (id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_specimen_fk
    FOREIGN KEY (specimen_id)
    REFERENCES activeclinic.specimens (id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_entered_by_fk
    FOREIGN KEY (entered_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_verified_by_fk
    FOREIGN KEY (verified_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_results_status_check
    CHECK (status IN ('draft', 'resulted', 'verified', 'released')),
  CONSTRAINT laboratory_results_summary_len
    CHECK (result_summary IS NULL OR char_length(result_summary) BETWEEN 1 AND 2000),
  CONSTRAINT laboratory_results_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.laboratory_results IS
  'Laboratory test results. Components stored separately in laboratory_result_components.';

CREATE INDEX IF NOT EXISTS laboratory_results_laboratory_request_idx
  ON activeclinic.laboratory_results (laboratory_request_id);

CREATE INDEX IF NOT EXISTS laboratory_results_facility_status_idx
  ON activeclinic.laboratory_results (facility_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS laboratory_results_patient_idx
  ON activeclinic.laboratory_results (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS laboratory_results_critical_facility_idx
  ON activeclinic.laboratory_results (facility_id, is_critical, created_at DESC)
  WHERE is_critical = true;

CREATE TABLE IF NOT EXISTS activeclinic.laboratory_result_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  laboratory_result_id UUID NOT NULL,
  test_name TEXT NOT NULL,
  test_code TEXT NULL,
  value_numeric DECIMAL(15, 4) NULL,
  value_text TEXT NULL,
  unit TEXT NULL,
  reference_range_low DECIMAL(15, 4) NULL,
  reference_range_high DECIMAL(15, 4) NULL,
  reference_range_text TEXT NULL,
  interpretation TEXT NULL,
  is_abnormal BOOLEAN NULL,
  component_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_result_components_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_result_components_result_fk
    FOREIGN KEY (laboratory_result_id)
    REFERENCES activeclinic.laboratory_results (id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_result_components_test_name_len
    CHECK (char_length(test_name) BETWEEN 1 AND 200),
  CONSTRAINT laboratory_result_components_test_code_len
    CHECK (test_code IS NULL OR char_length(test_code) BETWEEN 1 AND 64),
  CONSTRAINT laboratory_result_components_value_text_len
    CHECK (value_text IS NULL OR char_length(value_text) BETWEEN 1 AND 500),
  CONSTRAINT laboratory_result_components_unit_len
    CHECK (unit IS NULL OR char_length(unit) BETWEEN 1 AND 50),
  CONSTRAINT laboratory_result_components_reference_text_len
    CHECK (reference_range_text IS NULL OR char_length(reference_range_text) BETWEEN 1 AND 200),
  CONSTRAINT laboratory_result_components_interpretation_len
    CHECK (interpretation IS NULL OR char_length(interpretation) BETWEEN 1 AND 1000),
  CONSTRAINT laboratory_result_components_order_positive
    CHECK (component_order >= 1)
);

COMMENT ON TABLE activeclinic.laboratory_result_components IS
  'Individual test components within a laboratory result (e.g. WBC, RBC in CBC panel).';

CREATE INDEX IF NOT EXISTS laboratory_result_components_result_order_idx
  ON activeclinic.laboratory_result_components (laboratory_result_id, component_order);

CREATE TABLE IF NOT EXISTS activeclinic.laboratory_result_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  laboratory_result_id UUID NOT NULL,
  amendment_text TEXT NOT NULL,
  amendment_reason TEXT NOT NULL,
  amended_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_result_amendments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_result_amendments_result_fk
    FOREIGN KEY (laboratory_result_id)
    REFERENCES activeclinic.laboratory_results (id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_result_amendments_amended_by_fk
    FOREIGN KEY (amended_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_result_amendments_text_len
    CHECK (char_length(amendment_text) BETWEEN 1 AND 3000),
  CONSTRAINT laboratory_result_amendments_reason_len
    CHECK (char_length(amendment_reason) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.laboratory_result_amendments IS
  'Append-only amendments to released laboratory results. Never delete original.';

CREATE INDEX IF NOT EXISTS laboratory_result_amendments_result_created_idx
  ON activeclinic.laboratory_result_amendments (laboratory_result_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.radiology_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  clinical_order_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  request_number TEXT NOT NULL,
  study_type TEXT NOT NULL,
  study_description TEXT NULL,
  urgency TEXT NOT NULL DEFAULT 'routine',
  clinical_indication TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  study_performed_at TIMESTAMPTZ NULL,
  reported_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  requested_by_staff_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radiology_requests_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_order_fk
    FOREIGN KEY (clinical_order_id)
    REFERENCES activeclinic.clinical_orders (id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_requested_by_fk
    FOREIGN KEY (requested_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_requests_facility_number_unique
    UNIQUE (facility_id, request_number),
  CONSTRAINT radiology_requests_status_check
    CHECK (
      status IN (
        'pending', 'in_progress', 'completed', 'reported',
        'verified', 'released', 'cancelled'
      )
    ),
  CONSTRAINT radiology_requests_study_type_check
    CHECK (
      study_type IN (
        'x_ray', 'ct', 'mri', 'ultrasound', 'mammography',
        'fluoroscopy', 'nuclear_medicine', 'other'
      )
    ),
  CONSTRAINT radiology_requests_urgency_check
    CHECK (urgency IN ('routine', 'urgent', 'stat')),
  CONSTRAINT radiology_requests_number_len
    CHECK (char_length(request_number) BETWEEN 1 AND 64),
  CONSTRAINT radiology_requests_study_description_len
    CHECK (study_description IS NULL OR char_length(study_description) BETWEEN 1 AND 500),
  CONSTRAINT radiology_requests_clinical_indication_len
    CHECK (clinical_indication IS NULL OR char_length(clinical_indication) BETWEEN 1 AND 2000),
  CONSTRAINT radiology_requests_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.radiology_requests IS
  'Radiology/imaging requests linked to clinical_orders. Tracks study → report → verification.';

CREATE INDEX IF NOT EXISTS radiology_requests_facility_status_idx
  ON activeclinic.radiology_requests (facility_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS radiology_requests_encounter_idx
  ON activeclinic.radiology_requests (encounter_id);

CREATE INDEX IF NOT EXISTS radiology_requests_patient_idx
  ON activeclinic.radiology_requests (patient_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS radiology_requests_order_idx
  ON activeclinic.radiology_requests (clinical_order_id);

CREATE TABLE IF NOT EXISTS activeclinic.radiology_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  radiology_request_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  findings TEXT NULL,
  impression TEXT NULL,
  technique TEXT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  reported_at TIMESTAMPTZ NULL,
  reported_by_staff_id UUID NOT NULL,
  verified_by_staff_id UUID NULL,
  verified_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radiology_reports_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_radiology_request_fk
    FOREIGN KEY (radiology_request_id)
    REFERENCES activeclinic.radiology_requests (id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_reported_by_fk
    FOREIGN KEY (reported_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_verified_by_fk
    FOREIGN KEY (verified_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_reports_status_check
    CHECK (status IN ('draft', 'reported', 'verified', 'released')),
  CONSTRAINT radiology_reports_findings_len
    CHECK (findings IS NULL OR char_length(findings) BETWEEN 1 AND 10000),
  CONSTRAINT radiology_reports_impression_len
    CHECK (impression IS NULL OR char_length(impression) BETWEEN 1 AND 3000),
  CONSTRAINT radiology_reports_technique_len
    CHECK (technique IS NULL OR char_length(technique) BETWEEN 1 AND 1000),
  CONSTRAINT radiology_reports_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.radiology_reports IS
  'Radiology reports for imaging studies. No DICOM storage in P06 (future PACS integration).';

CREATE INDEX IF NOT EXISTS radiology_reports_radiology_request_idx
  ON activeclinic.radiology_reports (radiology_request_id);

CREATE INDEX IF NOT EXISTS radiology_reports_facility_status_idx
  ON activeclinic.radiology_reports (facility_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS radiology_reports_patient_idx
  ON activeclinic.radiology_reports (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS radiology_reports_critical_facility_idx
  ON activeclinic.radiology_reports (facility_id, is_critical, created_at DESC)
  WHERE is_critical = true;

CREATE TABLE IF NOT EXISTS activeclinic.radiology_report_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  radiology_report_id UUID NOT NULL,
  amendment_text TEXT NOT NULL,
  amendment_reason TEXT NOT NULL,
  amended_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radiology_report_amendments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_report_amendments_report_fk
    FOREIGN KEY (radiology_report_id)
    REFERENCES activeclinic.radiology_reports (id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_report_amendments_amended_by_fk
    FOREIGN KEY (amended_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT radiology_report_amendments_text_len
    CHECK (char_length(amendment_text) BETWEEN 1 AND 3000),
  CONSTRAINT radiology_report_amendments_reason_len
    CHECK (char_length(amendment_reason) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.radiology_report_amendments IS
  'Append-only amendments to released radiology reports. Never delete original.';

CREATE INDEX IF NOT EXISTS radiology_report_amendments_report_created_idx
  ON activeclinic.radiology_report_amendments (radiology_report_id, created_at);

CREATE OR REPLACE FUNCTION activeclinic.touch_laboratory_requests()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.request_number := trim(NEW.request_number);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS laboratory_requests_touch ON activeclinic.laboratory_requests;
CREATE TRIGGER laboratory_requests_touch
  BEFORE INSERT OR UPDATE ON activeclinic.laboratory_requests
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_laboratory_requests();

CREATE OR REPLACE FUNCTION activeclinic.touch_laboratory_results()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS laboratory_results_touch ON activeclinic.laboratory_results;
CREATE TRIGGER laboratory_results_touch
  BEFORE INSERT OR UPDATE ON activeclinic.laboratory_results
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_laboratory_results();

CREATE OR REPLACE FUNCTION activeclinic.touch_radiology_requests()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.request_number := trim(NEW.request_number);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radiology_requests_touch ON activeclinic.radiology_requests;
CREATE TRIGGER radiology_requests_touch
  BEFORE INSERT OR UPDATE ON activeclinic.radiology_requests
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_radiology_requests();

CREATE OR REPLACE FUNCTION activeclinic.touch_radiology_reports()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radiology_reports_touch ON activeclinic.radiology_reports;
CREATE TRIGGER radiology_reports_touch
  BEFORE INSERT OR UPDATE ON activeclinic.radiology_reports
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_radiology_reports();
