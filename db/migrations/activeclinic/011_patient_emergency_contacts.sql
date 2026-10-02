-- AC-V6-C01: administrative emergency contacts (not guardianship / legal authority).

CREATE TABLE IF NOT EXISTS activeclinic.patient_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  address_summary TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  consent_to_contact BOOLEAN NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NULL,
  CONSTRAINT patient_emergency_contacts_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_emergency_contacts_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_emergency_contacts_created_by_staff_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_emergency_contacts_full_name_len
    CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT patient_emergency_contacts_relationship_len
    CHECK (char_length(relationship) BETWEEN 1 AND 80),
  CONSTRAINT patient_emergency_contacts_phone_normalized_format
    CHECK (
      phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(phone_normalized) BETWEEN 8 AND 20
    ),
  CONSTRAINT patient_emergency_contacts_phone_display_len
    CHECK (char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT patient_emergency_contacts_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT patient_emergency_contacts_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    ),
  CONSTRAINT patient_emergency_contacts_address_summary_len
    CHECK (
      address_summary IS NULL
      OR char_length(address_summary) BETWEEN 1 AND 300
    ),
  CONSTRAINT patient_emergency_contacts_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT patient_emergency_contacts_archived_at_consistency
    CHECK (
      (status = 'archived' AND archived_at IS NOT NULL)
      OR (status <> 'archived')
    )
);

COMMENT ON TABLE activeclinic.patient_emergency_contacts IS
  'Administrative emergency contacts. Not legal guardianship or consent authority.';

CREATE UNIQUE INDEX IF NOT EXISTS patient_emergency_contacts_one_primary_uidx
  ON activeclinic.patient_emergency_contacts (patient_id)
  WHERE is_primary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS patient_emergency_contacts_patient_idx
  ON activeclinic.patient_emergency_contacts (patient_id, status);

CREATE INDEX IF NOT EXISTS patient_emergency_contacts_hco_idx
  ON activeclinic.patient_emergency_contacts (healthcare_organization_id, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_patient_emergency_contacts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name := trim(NEW.full_name);
  NEW.relationship := trim(NEW.relationship);
  NEW.phone_display := trim(NEW.phone_display);
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  IF NEW.address_summary IS NOT NULL THEN
    NEW.address_summary := trim(NEW.address_summary);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_emergency_contacts_touch
  ON activeclinic.patient_emergency_contacts;
CREATE TRIGGER patient_emergency_contacts_touch
  BEFORE INSERT OR UPDATE ON activeclinic.patient_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_patient_emergency_contacts();
