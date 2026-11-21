-- G05 record-migration inventory and retention metadata.
-- Digitisation does not authorize destruction of paper records.
-- This migration has no DELETE and no scheduled disposal.

CREATE TABLE IF NOT EXISTS activeclinic.record_migration_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  source_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_by_staff_id UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT record_migration_batches_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT record_migration_batches_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT record_migration_batches_opened_by_fk
    FOREIGN KEY (opened_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT record_migration_batches_status_check
    CHECK (status IN ('open', 'validated', 'exception', 'closed')),
  CONSTRAINT record_migration_batches_source_len
    CHECK (char_length(source_label) BETWEEN 1 AND 200),
  CONSTRAINT record_migration_batches_id_org_unique UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS record_migration_batches_facility_idx
  ON activeclinic.record_migration_batches (organization_id, facility_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.record_migration_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  source_filename TEXT NOT NULL,
  declared_media_type TEXT NOT NULL,
  declared_byte_size INTEGER NOT NULL,
  document_category TEXT NOT NULL,
  record_origin TEXT NOT NULL,
  patient_match_status TEXT NOT NULL DEFAULT 'unmatched',
  matched_patient_id UUID NULL,
  source_captured_on DATE NULL,
  image_quality_note TEXT NULL,
  exception_note TEXT NULL,
  recorded_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT record_migration_files_batch_fk
    FOREIGN KEY (batch_id, organization_id)
    REFERENCES activeclinic.record_migration_batches (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT record_migration_files_origin_check
    CHECK (record_origin IN ('clinician_authored', 'imported')),
  CONSTRAINT record_migration_files_match_check
    CHECK (patient_match_status IN ('unmatched', 'review_required', 'candidate')),
  CONSTRAINT record_migration_files_size_positive
    CHECK (declared_byte_size > 0),
  CONSTRAINT record_migration_files_filename_len
    CHECK (char_length(source_filename) BETWEEN 1 AND 200),
  CONSTRAINT record_migration_files_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT record_migration_files_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS record_migration_files_patient_idx
  ON activeclinic.record_migration_files (organization_id, matched_patient_id, source_captured_on);

CREATE INDEX IF NOT EXISTS record_migration_files_category_idx
  ON activeclinic.record_migration_files (organization_id, facility_id, document_category);

CREATE TABLE IF NOT EXISTS activeclinic.retention_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  category_key TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retention_categories_org_key_unique UNIQUE (organization_id, category_key),
  CONSTRAINT retention_categories_review_check
    CHECK (review_status IN ('pending_review', 'reviewed')),
  CONSTRAINT retention_categories_key_len
    CHECK (char_length(category_key) BETWEEN 1 AND 80)
);

COMMENT ON TABLE activeclinic.retention_categories IS
  'Caller-approved retention labels. No elapsed-time deletion is defined here.';

CREATE TABLE IF NOT EXISTS activeclinic.retention_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NULL,
  category_id UUID NOT NULL,
  hold_status TEXT NOT NULL DEFAULT 'placed',
  reason TEXT NOT NULL,
  placed_by_staff_id UUID NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retention_holds_status_check
    CHECK (hold_status IN ('placed', 'released')),
  CONSTRAINT retention_holds_reason_len
    CHECK (char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT retention_holds_category_fk
    FOREIGN KEY (category_id)
    REFERENCES activeclinic.retention_categories (id)
    ON DELETE RESTRICT,
  CONSTRAINT retention_holds_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE activeclinic.retention_holds IS
  'A placed hold blocks disposal. Releasing a hold still does not delete records or paper.';
