-- AC-V6-P04: clinical encounters, triage, vitals, consultation, orders, alerts.
-- Append-only clinical foundation. Immutable vital signs, draft vs signed consultation notes.

CREATE TABLE IF NOT EXISTS activeclinic.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  arrival_id UUID NULL,
  encounter_number TEXT NOT NULL,
  encounter_type TEXT NOT NULL DEFAULT 'outpatient',
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  opened_by_staff_id UUID NOT NULL,
  closed_by_staff_id UUID NULL,
  closure_note TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT encounters_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_arrival_fk
    FOREIGN KEY (arrival_id)
    REFERENCES activeclinic.reception_arrivals (id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_opened_by_staff_fk
    FOREIGN KEY (opened_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_closed_by_staff_fk
    FOREIGN KEY (closed_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounters_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT encounters_facility_number_unique
    UNIQUE (facility_id, encounter_number),
  CONSTRAINT encounters_type_check
    CHECK (encounter_type IN ('outpatient', 'emergency', 'referral', 'follow_up', 'other')),
  CONSTRAINT encounters_status_check
    CHECK (status IN ('open', 'completed', 'cancelled')),
  CONSTRAINT encounters_number_len
    CHECK (char_length(encounter_number) BETWEEN 1 AND 64),
  CONSTRAINT encounters_closure_note_len
    CHECK (closure_note IS NULL OR char_length(closure_note) BETWEEN 1 AND 500),
  CONSTRAINT encounters_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.encounters IS
  'Clinical encounter sessions. Append-only lifecycle with versioned updates.';

CREATE INDEX IF NOT EXISTS encounters_facility_status_opened_idx
  ON activeclinic.encounters (facility_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS encounters_patient_opened_idx
  ON activeclinic.encounters (patient_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS encounters_hco_status_idx
  ON activeclinic.encounters (healthcare_organization_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS encounters_arrival_idx
  ON activeclinic.encounters (arrival_id)
  WHERE arrival_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activeclinic.encounter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_metadata JSONB NULL,
  note TEXT NULL,
  actor_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT encounter_events_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounter_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounter_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT encounter_events_type_check
    CHECK (
      event_type IN (
        'opened', 'triage_recorded', 'vitals_recorded', 'nursing_intake_recorded',
        'consultation_started', 'consultation_signed', 'diagnosis_recorded',
        'order_created', 'alert_raised', 'closed', 'cancelled'
      )
    ),
  CONSTRAINT encounter_events_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.encounter_events IS
  'Append-only encounter audit log. No deletes.';

CREATE INDEX IF NOT EXISTS encounter_events_encounter_created_idx
  ON activeclinic.encounter_events (encounter_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.triage_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  triage_category TEXT NULL,
  chief_complaint TEXT NOT NULL,
  presenting_symptoms TEXT NULL,
  allergies_reported TEXT NULL,
  current_medications_reported TEXT NULL,
  medical_history_summary TEXT NULL,
  pain_level INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  completed_at TIMESTAMPTZ NULL,
  recorded_by_staff_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT triage_assessments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT triage_assessments_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT triage_assessments_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT triage_assessments_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT triage_assessments_recorded_by_fk
    FOREIGN KEY (recorded_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT triage_assessments_category_check
    CHECK (
      triage_category IS NULL OR
      triage_category IN ('emergency', 'urgent', 'semi_urgent', 'non_urgent')
    ),
  CONSTRAINT triage_assessments_status_check
    CHECK (status IN ('draft', 'completed')),
  CONSTRAINT triage_assessments_pain_level_range
    CHECK (pain_level IS NULL OR (pain_level >= 0 AND pain_level <= 10)),
  CONSTRAINT triage_assessments_chief_complaint_len
    CHECK (char_length(chief_complaint) BETWEEN 1 AND 1000),
  CONSTRAINT triage_assessments_symptoms_len
    CHECK (presenting_symptoms IS NULL OR char_length(presenting_symptoms) BETWEEN 1 AND 2000),
  CONSTRAINT triage_assessments_allergies_len
    CHECK (allergies_reported IS NULL OR char_length(allergies_reported) BETWEEN 1 AND 1000),
  CONSTRAINT triage_assessments_medications_len
    CHECK (current_medications_reported IS NULL OR char_length(current_medications_reported) BETWEEN 1 AND 2000),
  CONSTRAINT triage_assessments_history_len
    CHECK (medical_history_summary IS NULL OR char_length(medical_history_summary) BETWEEN 1 AND 2000),
  CONSTRAINT triage_assessments_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.triage_assessments IS
  'Triage assessment data per encounter. Manual triage category assignment only.';

CREATE INDEX IF NOT EXISTS triage_assessments_encounter_idx
  ON activeclinic.triage_assessments (encounter_id);

CREATE INDEX IF NOT EXISTS triage_assessments_facility_status_idx
  ON activeclinic.triage_assessments (facility_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.vital_sign_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  observation_type TEXT NOT NULL,
  value_numeric DECIMAL(10, 2) NULL,
  value_text TEXT NULL,
  unit TEXT NULL,
  systolic INTEGER NULL,
  diastolic INTEGER NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_staff_id UUID NOT NULL,
  corrects_observation_id UUID NULL,
  correction_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vital_sign_observations_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_recorded_by_fk
    FOREIGN KEY (recorded_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_corrects_fk
    FOREIGN KEY (corrects_observation_id, healthcare_organization_id)
    REFERENCES activeclinic.vital_sign_observations (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT vital_sign_observations_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT vital_sign_observations_type_check
    CHECK (
      observation_type IN (
        'blood_pressure', 'heart_rate', 'respiratory_rate', 'temperature',
        'oxygen_saturation', 'weight', 'height', 'bmi', 'other'
      )
    ),
  CONSTRAINT vital_sign_observations_unit_len
    CHECK (unit IS NULL OR char_length(unit) BETWEEN 1 AND 20),
  CONSTRAINT vital_sign_observations_value_text_len
    CHECK (value_text IS NULL OR char_length(value_text) BETWEEN 1 AND 200),
  CONSTRAINT vital_sign_observations_correction_reason_len
    CHECK (correction_reason IS NULL OR char_length(correction_reason) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.vital_sign_observations IS
  'Immutable vital sign observations. Amendments create new rows with corrects_observation_id.';

CREATE INDEX IF NOT EXISTS vital_sign_observations_encounter_observed_idx
  ON activeclinic.vital_sign_observations (encounter_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS vital_sign_observations_patient_type_observed_idx
  ON activeclinic.vital_sign_observations (patient_id, observation_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS vital_sign_observations_corrects_idx
  ON activeclinic.vital_sign_observations (corrects_observation_id)
  WHERE corrects_observation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activeclinic.nursing_intake_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  intake_note_text TEXT NOT NULL,
  recorded_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nursing_intake_notes_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT nursing_intake_notes_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT nursing_intake_notes_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT nursing_intake_notes_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT nursing_intake_notes_recorded_by_fk
    FOREIGN KEY (recorded_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT nursing_intake_notes_text_len
    CHECK (char_length(intake_note_text) BETWEEN 1 AND 3000)
);

COMMENT ON TABLE activeclinic.nursing_intake_notes IS
  'Nursing intake documentation per encounter. Separate from triage if workflow requires.';

CREATE INDEX IF NOT EXISTS nursing_intake_notes_encounter_idx
  ON activeclinic.nursing_intake_notes (encounter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'consultation',
  subjective_text TEXT NULL,
  objective_text TEXT NULL,
  assessment_text TEXT NULL,
  plan_text TEXT NULL,
  additional_notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  signed_at TIMESTAMPTZ NULL,
  signed_by_staff_id UUID NULL,
  created_by_staff_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consultation_notes_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_signed_by_fk
    FOREIGN KEY (signed_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_created_by_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_notes_note_type_check
    CHECK (note_type IN ('consultation', 'progress', 'discharge', 'referral')),
  CONSTRAINT consultation_notes_status_check
    CHECK (status IN ('draft', 'signed')),
  CONSTRAINT consultation_notes_subjective_len
    CHECK (subjective_text IS NULL OR char_length(subjective_text) BETWEEN 1 AND 5000),
  CONSTRAINT consultation_notes_objective_len
    CHECK (objective_text IS NULL OR char_length(objective_text) BETWEEN 1 AND 5000),
  CONSTRAINT consultation_notes_assessment_len
    CHECK (assessment_text IS NULL OR char_length(assessment_text) BETWEEN 1 AND 5000),
  CONSTRAINT consultation_notes_plan_len
    CHECK (plan_text IS NULL OR char_length(plan_text) BETWEEN 1 AND 5000),
  CONSTRAINT consultation_notes_additional_len
    CHECK (additional_notes IS NULL OR char_length(additional_notes) BETWEEN 1 AND 3000),
  CONSTRAINT consultation_notes_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.consultation_notes IS
  'Clinical consultation notes with draft/signed states. Signed notes immutable; amendments via events.';

CREATE INDEX IF NOT EXISTS consultation_notes_encounter_created_idx
  ON activeclinic.consultation_notes (encounter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS consultation_notes_facility_status_idx
  ON activeclinic.consultation_notes (facility_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.consultation_note_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  consultation_note_id UUID NOT NULL,
  amendment_text TEXT NOT NULL,
  amendment_reason TEXT NOT NULL,
  amended_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consultation_note_amendments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_note_amendments_note_fk
    FOREIGN KEY (consultation_note_id)
    REFERENCES activeclinic.consultation_notes (id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_note_amendments_amended_by_fk
    FOREIGN KEY (amended_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT consultation_note_amendments_text_len
    CHECK (char_length(amendment_text) BETWEEN 1 AND 3000),
  CONSTRAINT consultation_note_amendments_reason_len
    CHECK (char_length(amendment_reason) BETWEEN 1 AND 500)
);

COMMENT ON TABLE activeclinic.consultation_note_amendments IS
  'Append-only amendments to signed consultation notes. Never edit original.';

CREATE INDEX IF NOT EXISTS consultation_note_amendments_note_idx
  ON activeclinic.consultation_note_amendments (consultation_note_id, created_at);

CREATE TABLE IF NOT EXISTS activeclinic.clinical_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  diagnosis_code TEXT NULL,
  diagnosis_text TEXT NOT NULL,
  diagnosis_type TEXT NOT NULL DEFAULT 'primary',
  certainty TEXT NULL,
  recorded_by_staff_id UUID NOT NULL,
  corrects_diagnosis_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_diagnoses_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_recorded_by_fk
    FOREIGN KEY (recorded_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_corrects_fk
    FOREIGN KEY (corrects_diagnosis_id)
    REFERENCES activeclinic.clinical_diagnoses (id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_diagnoses_type_check
    CHECK (diagnosis_type IN ('primary', 'secondary', 'differential', 'ruled_out')),
  CONSTRAINT clinical_diagnoses_certainty_check
    CHECK (certainty IS NULL OR certainty IN ('confirmed', 'suspected', 'provisional')),
  CONSTRAINT clinical_diagnoses_code_len
    CHECK (diagnosis_code IS NULL OR char_length(diagnosis_code) BETWEEN 1 AND 64),
  CONSTRAINT clinical_diagnoses_text_len
    CHECK (char_length(diagnosis_text) BETWEEN 1 AND 1000)
);

COMMENT ON TABLE activeclinic.clinical_diagnoses IS
  'Clinical diagnosis entries. Append-only; corrections via corrects_diagnosis_id.';

CREATE INDEX IF NOT EXISTS clinical_diagnoses_encounter_idx
  ON activeclinic.clinical_diagnoses (encounter_id, created_at);

CREATE INDEX IF NOT EXISTS clinical_diagnoses_patient_idx
  ON activeclinic.clinical_diagnoses (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.clinical_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  order_type TEXT NOT NULL,
  order_details JSONB NULL,
  instructions TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ NULL,
  ordered_by_staff_id UUID NOT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_by_staff_id UUID NULL,
  cancellation_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_orders_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_ordered_by_fk
    FOREIGN KEY (ordered_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_cancelled_by_fk
    FOREIGN KEY (cancelled_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_orders_type_check
    CHECK (order_type IN ('laboratory', 'prescription', 'radiology', 'other')),
  CONSTRAINT clinical_orders_status_check
    CHECK (status IN ('draft', 'submitted', 'cancelled')),
  CONSTRAINT clinical_orders_instructions_len
    CHECK (instructions IS NULL OR char_length(instructions) BETWEEN 1 AND 2000),
  CONSTRAINT clinical_orders_cancellation_reason_len
    CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 500),
  CONSTRAINT clinical_orders_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.clinical_orders IS
  'Clinical orders (lab/prescription/radiology). Order creation only; fulfillment = P05/P06.';

CREATE INDEX IF NOT EXISTS clinical_orders_encounter_created_idx
  ON activeclinic.clinical_orders (encounter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_orders_facility_type_status_idx
  ON activeclinic.clinical_orders (facility_id, order_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.clinical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NULL,
  patient_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  alert_message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  raised_by_staff_id UUID NOT NULL,
  acknowledged_by_staff_id UUID NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  resolved_by_staff_id UUID NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolution_note TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_alerts_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_raised_by_fk
    FOREIGN KEY (raised_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_acknowledged_by_fk
    FOREIGN KEY (acknowledged_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_resolved_by_fk
    FOREIGN KEY (resolved_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_alerts_type_check
    CHECK (
      alert_type IN (
        'clinical_deterioration', 'critical_result', 'resource_required',
        'follow_up_needed', 'medication_alert', 'other'
      )
    ),
  CONSTRAINT clinical_alerts_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT clinical_alerts_status_check
    CHECK (status IN ('active', 'acknowledged', 'resolved', 'cancelled')),
  CONSTRAINT clinical_alerts_message_len
    CHECK (char_length(alert_message) BETWEEN 1 AND 1000),
  CONSTRAINT clinical_alerts_resolution_note_len
    CHECK (resolution_note IS NULL OR char_length(resolution_note) BETWEEN 1 AND 1000),
  CONSTRAINT clinical_alerts_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.clinical_alerts IS
  'Manual escalation alerts. No auto-escalation in P04; clinician must explicitly raise.';

CREATE INDEX IF NOT EXISTS clinical_alerts_facility_status_priority_idx
  ON activeclinic.clinical_alerts (facility_id, status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_alerts_encounter_status_idx
  ON activeclinic.clinical_alerts (encounter_id, status)
  WHERE encounter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clinical_alerts_patient_idx
  ON activeclinic.clinical_alerts (patient_id, created_at DESC);

CREATE OR REPLACE FUNCTION activeclinic.touch_encounters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.encounter_number := trim(NEW.encounter_number);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encounters_touch ON activeclinic.encounters;
CREATE TRIGGER encounters_touch
  BEFORE INSERT OR UPDATE ON activeclinic.encounters
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_encounters();

CREATE OR REPLACE FUNCTION activeclinic.touch_triage_assessments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_assessments_touch ON activeclinic.triage_assessments;
CREATE TRIGGER triage_assessments_touch
  BEFORE INSERT OR UPDATE ON activeclinic.triage_assessments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_triage_assessments();

CREATE OR REPLACE FUNCTION activeclinic.touch_consultation_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultation_notes_touch ON activeclinic.consultation_notes;
CREATE TRIGGER consultation_notes_touch
  BEFORE INSERT OR UPDATE ON activeclinic.consultation_notes
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_consultation_notes();

CREATE OR REPLACE FUNCTION activeclinic.touch_clinical_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinical_orders_touch ON activeclinic.clinical_orders;
CREATE TRIGGER clinical_orders_touch
  BEFORE INSERT OR UPDATE ON activeclinic.clinical_orders
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_clinical_orders();

CREATE OR REPLACE FUNCTION activeclinic.touch_clinical_alerts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinical_alerts_touch ON activeclinic.clinical_alerts;
CREATE TRIGGER clinical_alerts_touch
  BEFORE INSERT OR UPDATE ON activeclinic.clinical_alerts
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_clinical_alerts();
