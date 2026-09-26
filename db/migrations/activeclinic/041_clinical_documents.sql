-- V2.03 ACN18: clinical documents (staff PHI domain).
-- Hierarchy: organization → HCO → facility → patient → optional encounter → document.
-- Statuses: draft | final. Final documents are not ordinary-editable.
-- Binary attachments DEFERRED — no public CMS/CDN storage for PHI.
-- Does NOT replace consultation_notes (B2-06) or AC-P05 patient release.

CREATE TABLE IF NOT EXISTS activeclinic.clinical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  encounter_id UUID NULL,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NULL,
  document_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by_staff_id UUID NOT NULL,
  finalized_by_staff_id UUID NULL,
  finalized_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_documents_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_created_by_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_finalized_by_fk
    FOREIGN KEY (finalized_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_documents_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT clinical_documents_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT clinical_documents_type_check
    CHECK (
      document_type IN (
        'clinical_note',
        'medical_certificate',
        'referral_letter',
        'discharge_summary',
        'clinical_attachment',
        'other'
      )
    ),
  CONSTRAINT clinical_documents_status_check
    CHECK (status IN ('draft', 'final')),
  CONSTRAINT clinical_documents_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT clinical_documents_body_len
    CHECK (body_text IS NULL OR char_length(body_text) BETWEEN 1 AND 20000),
  CONSTRAINT clinical_documents_final_consistency
    CHECK (
      (status = 'draft' AND finalized_at IS NULL AND finalized_by_staff_id IS NULL)
      OR (status = 'final' AND finalized_at IS NOT NULL AND finalized_by_staff_id IS NOT NULL)
    )
);

COMMENT ON TABLE activeclinic.clinical_documents IS
  'ACN18 staff clinical documents (PHI). Draft/final lifecycle. No binary attachments in MVP.';

CREATE INDEX IF NOT EXISTS clinical_documents_patient_created_idx
  ON activeclinic.clinical_documents (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_documents_org_facility_idx
  ON activeclinic.clinical_documents (organization_id, facility_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_documents_encounter_idx
  ON activeclinic.clinical_documents (encounter_id)
  WHERE encounter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clinical_documents_status_idx
  ON activeclinic.clinical_documents (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.clinical_document_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_staff_id UUID NULL,
  actor_platform_identity_id UUID NULL,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_document_events_document_fk
    FOREIGN KEY (document_id, organization_id)
    REFERENCES activeclinic.clinical_documents (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT clinical_document_events_actor_staff_fk
    FOREIGN KEY (actor_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT clinical_document_events_type_check
    CHECK (event_type IN ('created', 'updated', 'finalized'))
);

COMMENT ON TABLE activeclinic.clinical_document_events IS
  'ACN18 document history (created/updated/finalized). Download/upload deferred with binary storage.';

CREATE INDEX IF NOT EXISTS clinical_document_events_document_idx
  ON activeclinic.clinical_document_events (document_id, created_at DESC);

CREATE OR REPLACE FUNCTION activeclinic.touch_clinical_documents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := trim(NEW.title);
  IF NEW.body_text IS NOT NULL THEN
    NEW.body_text := trim(NEW.body_text);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinical_documents_touch ON activeclinic.clinical_documents;
CREATE TRIGGER clinical_documents_touch
  BEFORE INSERT OR UPDATE ON activeclinic.clinical_documents
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_clinical_documents();

-- Narrow clinical-document permissions (PHI). Not granted via facility.update alone.
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.clinical_document.view', 'activeclinic', 'view',
   'View clinical documents',
   'View staff clinical documents for patients in scope (PHI)',
   'highly_sensitive'),
  ('activeclinic.clinical_document.create', 'activeclinic', 'create',
   'Create and edit clinical document drafts',
   'Create and edit draft clinical documents. Cannot edit finalized documents.',
   'highly_sensitive'),
  ('activeclinic.clinical_document.finalize', 'activeclinic', 'finalize',
   'Finalize clinical documents',
   'Finalize draft clinical documents (immutable thereafter for ordinary edits)',
   'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

-- Clinician: full document lifecycle (mirrors consultation.record/sign semantics)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_clinician'
   AND p.permission_key IN (
     'activeclinic.clinical_document.view',
     'activeclinic.clinical_document.create',
     'activeclinic.clinical_document.finalize'
   )
ON CONFLICT DO NOTHING;

-- Nurse: view only (care context; no create/finalize)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_nurse'
   AND p.permission_key = 'activeclinic.clinical_document.view'
ON CONFLICT DO NOTHING;
