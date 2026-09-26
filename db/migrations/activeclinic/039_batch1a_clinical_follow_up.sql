-- V2.03 Batch 1A clinical: encounter draft fields + clinical follow-up worklist (ACN14–16).
-- Clinical data stays in activeclinic.* — never platform generic tables.

-- ---------------------------------------------------------------------------
-- Consultation note structured draft fields (ACN15) — free text only.
-- No ICD automation, prescribing engine, lab/pharmacy integration.
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.consultation_notes
  ADD COLUMN IF NOT EXISTS history_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS medication_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_plan_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS referral_text TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_notes_history_text_len'
  ) THEN
    ALTER TABLE activeclinic.consultation_notes
      ADD CONSTRAINT consultation_notes_history_text_len
      CHECK (history_text IS NULL OR char_length(history_text) BETWEEN 1 AND 8000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_notes_medication_text_len'
  ) THEN
    ALTER TABLE activeclinic.consultation_notes
      ADD CONSTRAINT consultation_notes_medication_text_len
      CHECK (medication_text IS NULL OR char_length(medication_text) BETWEEN 1 AND 4000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_notes_follow_up_plan_text_len'
  ) THEN
    ALTER TABLE activeclinic.consultation_notes
      ADD CONSTRAINT consultation_notes_follow_up_plan_text_len
      CHECK (follow_up_plan_text IS NULL OR char_length(follow_up_plan_text) BETWEEN 1 AND 4000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_notes_referral_text_len'
  ) THEN
    ALTER TABLE activeclinic.consultation_notes
      ADD CONSTRAINT consultation_notes_referral_text_len
      CHECK (referral_text IS NULL OR char_length(referral_text) BETWEEN 1 AND 4000);
  END IF;
END $$;

COMMENT ON COLUMN activeclinic.consultation_notes.medication_text IS
  'Documented medication plan text only — not a prescribing or dispense engine.';
COMMENT ON COLUMN activeclinic.consultation_notes.referral_text IS
  'Referral narrative for clinical follow-up — not an external referral integration.';

-- ---------------------------------------------------------------------------
-- Clinical follow-up / recall worklist (ACN16) — AC-owned
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.clinical_follow_up_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  encounter_id UUID NULL,
  appointment_id UUID NULL,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  urgency TEXT NOT NULL DEFAULT 'routine',
  due_at TIMESTAMPTZ NULL,
  owner_staff_id UUID NULL,
  originating_staff_id UUID NULL,
  completed_at TIMESTAMPTZ NULL,
  completed_by_staff_id UUID NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_follow_up_items_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_appointment_fk
    FOREIGN KEY (appointment_id)
    REFERENCES activeclinic.appointments (id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_owner_fk
    FOREIGN KEY (owner_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_originating_fk
    FOREIGN KEY (originating_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_completed_by_fk
    FOREIGN KEY (completed_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_items_type_check
    CHECK (
      item_type IN (
        'due_review',
        'missed_appointment',
        'pending_referral',
        'incomplete_notes',
        'outstanding_action'
      )
    ),
  CONSTRAINT clinical_follow_up_items_status_check
    CHECK (
      status IN (
        'open',
        'action_required',
        'contact_attempted',
        'scheduled',
        'in_progress',
        'completed',
        'cancelled'
      )
    ),
  CONSTRAINT clinical_follow_up_items_urgency_check
    CHECK (urgency IN ('routine', 'priority', 'critical')),
  CONSTRAINT clinical_follow_up_items_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT clinical_follow_up_items_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 2000),
  CONSTRAINT clinical_follow_up_items_version_positive
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS clinical_follow_up_items_facility_status_due_idx
  ON activeclinic.clinical_follow_up_items (facility_id, status, due_at ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS clinical_follow_up_items_org_type_idx
  ON activeclinic.clinical_follow_up_items (organization_id, item_type, status);

CREATE INDEX IF NOT EXISTS clinical_follow_up_items_owner_idx
  ON activeclinic.clinical_follow_up_items (owner_staff_id, status)
  WHERE owner_staff_id IS NOT NULL;

COMMENT ON TABLE activeclinic.clinical_follow_up_items IS
  'ACN16 clinical follow-up / recall worklist. Distinct from PA registration follow-up and billing collections.';

CREATE TABLE IF NOT EXISTS activeclinic.clinical_follow_up_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  follow_up_item_id UUID NOT NULL
    REFERENCES activeclinic.clinical_follow_up_items (id)
    ON DELETE RESTRICT,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  note TEXT NULL,
  actor_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_follow_up_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_events_actor_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_follow_up_events_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS clinical_follow_up_events_item_idx
  ON activeclinic.clinical_follow_up_events (follow_up_item_id, created_at ASC);

COMMENT ON TABLE activeclinic.clinical_follow_up_events IS
  'Append-only status history for clinical follow-up items.';
