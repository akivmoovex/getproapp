-- V2.03 Batch 1A patient/reception: clinical consent ledger + next-of-kin + clinic fields.
-- Extends existing patients / emergency contacts — does not create a second identity system.

-- ---------------------------------------------------------------------------
-- Patient administrative extensions (next of kin + clinic-specific fields)
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.patients
  ADD COLUMN IF NOT EXISTS next_of_kin_full_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT NULL,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone_display TEXT NULL,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone_normalized TEXT NULL,
  ADD COLUMN IF NOT EXISTS clinic_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_next_of_kin_full_name_len'
  ) THEN
    ALTER TABLE activeclinic.patients
      ADD CONSTRAINT patients_next_of_kin_full_name_len
      CHECK (
        next_of_kin_full_name IS NULL
        OR char_length(next_of_kin_full_name) BETWEEN 1 AND 120
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_next_of_kin_relationship_len'
  ) THEN
    ALTER TABLE activeclinic.patients
      ADD CONSTRAINT patients_next_of_kin_relationship_len
      CHECK (
        next_of_kin_relationship IS NULL
        OR char_length(next_of_kin_relationship) BETWEEN 1 AND 80
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_clinic_fields_json_object'
  ) THEN
    ALTER TABLE activeclinic.patients
      ADD CONSTRAINT patients_clinic_fields_json_object
      CHECK (jsonb_typeof(clinic_fields_json) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN activeclinic.patients.next_of_kin_full_name IS
  'Administrative next-of-kin name (not legal guardianship).';
COMMENT ON COLUMN activeclinic.patients.clinic_fields_json IS
  'Clinic-specific non-clinical registration fields (HCO-scoped).';

-- ---------------------------------------------------------------------------
-- Clinical consent ledger (AC-owned; not platform registration T&Cs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'granted',
  granted_at TIMESTAMPTZ NULL,
  withdrawn_at TIMESTAMPTZ NULL,
  capture_method TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  note TEXT NULL,
  captured_by_staff_id UUID NULL,
  withdrawn_by_staff_id UUID NULL,
  withdrawal_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_consents_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consents_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consents_captured_by_fk
    FOREIGN KEY (captured_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consents_withdrawn_by_fk
    FOREIGN KEY (withdrawn_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consents_type_check
    CHECK (
      consent_type IN (
        'treatment',
        'data_processing',
        'sharing_with_referrer',
        'photography',
        'research_contact',
        'other'
      )
    ),
  CONSTRAINT patient_consents_status_check
    CHECK (status IN ('granted', 'withdrawn', 'expired', 'refused')),
  CONSTRAINT patient_consents_method_check
    CHECK (
      capture_method IN (
        'verbal',
        'written',
        'digital',
        'guardian_verbal',
        'guardian_written',
        'other'
      )
    ),
  CONSTRAINT patient_consents_version_len
    CHECK (char_length(consent_version) BETWEEN 1 AND 40),
  CONSTRAINT patient_consents_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  CONSTRAINT patient_consents_withdrawal_reason_len
    CHECK (
      withdrawal_reason IS NULL
      OR char_length(withdrawal_reason) BETWEEN 1 AND 500
    ),
  CONSTRAINT patient_consents_granted_requires_at
    CHECK (status <> 'granted' OR granted_at IS NOT NULL),
  CONSTRAINT patient_consents_withdrawn_requires_at
    CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS patient_consents_patient_idx
  ON activeclinic.patient_consents (organization_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_consents_org_type_status_idx
  ON activeclinic.patient_consents (organization_id, consent_type, status);

COMMENT ON TABLE activeclinic.patient_consents IS
  'AC clinical/administrative consent ledger. Distinct from platform registration T&Cs and communication preferences.';

-- Append-only status history for consent rows
CREATE TABLE IF NOT EXISTS activeclinic.patient_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_consent_id UUID NOT NULL
    REFERENCES activeclinic.patient_consents (id)
    ON DELETE RESTRICT,
  patient_id UUID NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  reason_code TEXT NULL,
  note TEXT NULL,
  actor_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_consent_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consent_events_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consent_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_consent_events_to_status_check
    CHECK (to_status IN ('granted', 'withdrawn', 'expired', 'refused'))
);

CREATE INDEX IF NOT EXISTS patient_consent_events_consent_idx
  ON activeclinic.patient_consent_events (patient_consent_id, created_at ASC);

COMMENT ON TABLE activeclinic.patient_consent_events IS
  'Timestamped consent status history (append-only).';
