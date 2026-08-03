-- AC-V6-C01: organization-scoped patient external identifiers.

CREATE TABLE IF NOT EXISTS activeclinic.patient_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value_normalized TEXT NOT NULL,
  identifier_value_display TEXT NOT NULL,
  issuing_country_code TEXT NULL,
  issuer TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verified_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NULL,
  CONSTRAINT patient_identifiers_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_identifiers_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_identifiers_created_by_staff_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_identifiers_type_check
    CHECK (
      identifier_type IN (
        'national_id',
        'passport',
        'birth_certificate',
        'insurance_member_number',
        'facility_legacy_number',
        'other'
      )
    ),
  CONSTRAINT patient_identifiers_value_normalized_len
    CHECK (char_length(identifier_value_normalized) BETWEEN 1 AND 128),
  CONSTRAINT patient_identifiers_value_display_len
    CHECK (char_length(identifier_value_display) BETWEEN 1 AND 128),
  CONSTRAINT patient_identifiers_issuing_country_format
    CHECK (
      issuing_country_code IS NULL
      OR issuing_country_code ~ '^[A-Z]{2}$'
    ),
  CONSTRAINT patient_identifiers_issuer_len
    CHECK (issuer IS NULL OR char_length(issuer) BETWEEN 1 AND 120),
  CONSTRAINT patient_identifiers_verification_status_check
    CHECK (
      verification_status IN ('unverified', 'verified', 'rejected', 'expired')
    ),
  CONSTRAINT patient_identifiers_verified_at_consistency
    CHECK (
      (verification_status = 'verified' AND verified_at IS NOT NULL)
      OR (verification_status <> 'verified')
    ),
  CONSTRAINT patient_identifiers_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT patient_identifiers_archived_at_consistency
    CHECK (
      (status = 'archived' AND archived_at IS NOT NULL)
      OR (status <> 'archived')
    )
);

COMMENT ON TABLE activeclinic.patient_identifiers IS
  'HCO-scoped external identifiers for patients. No global uniqueness; no document scans.';

-- One live (non-archived) identifier value per type within an HCO.
CREATE UNIQUE INDEX IF NOT EXISTS patient_identifiers_hco_type_value_live_uidx
  ON activeclinic.patient_identifiers (
    healthcare_organization_id,
    identifier_type,
    identifier_value_normalized
  )
  WHERE status <> 'archived';

-- At most one active primary identifier per patient.
CREATE UNIQUE INDEX IF NOT EXISTS patient_identifiers_one_primary_uidx
  ON activeclinic.patient_identifiers (patient_id)
  WHERE is_primary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS patient_identifiers_patient_idx
  ON activeclinic.patient_identifiers (patient_id, status);

CREATE INDEX IF NOT EXISTS patient_identifiers_hco_type_idx
  ON activeclinic.patient_identifiers (healthcare_organization_id, identifier_type, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_patient_identifiers()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.identifier_value_normalized := upper(trim(NEW.identifier_value_normalized));
  NEW.identifier_value_display := trim(NEW.identifier_value_display);
  IF NEW.issuing_country_code IS NOT NULL THEN
    NEW.issuing_country_code := upper(trim(NEW.issuing_country_code));
  END IF;
  IF NEW.issuer IS NOT NULL THEN
    NEW.issuer := trim(NEW.issuer);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_identifiers_touch ON activeclinic.patient_identifiers;
CREATE TRIGGER patient_identifiers_touch
  BEFORE INSERT OR UPDATE ON activeclinic.patient_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_patient_identifiers();
