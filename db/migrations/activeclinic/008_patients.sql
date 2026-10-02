-- AC-V6-C01: ActiveClinic patient administrative identity (HCO-owned).
-- Patients are healthcare recipients — not staff, not platform login principals.

-- Composite uniqueness for ownership FKs from patient child tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'facilities_id_hco_unique'
  ) THEN
    ALTER TABLE activeclinic.facilities
      ADD CONSTRAINT facilities_id_hco_unique UNIQUE (id, healthcare_organization_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activeclinic.patient_number_counters (
  healthcare_organization_id UUID NOT NULL
    REFERENCES activeclinic.healthcare_organizations (id)
    ON DELETE RESTRICT,
  year_bucket INTEGER NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (healthcare_organization_id, year_bucket),
  CONSTRAINT patient_number_counters_year_check
    CHECK (year_bucket BETWEEN 2000 AND 2100),
  CONSTRAINT patient_number_counters_last_value_check
    CHECK (last_value >= 0)
);

COMMENT ON TABLE activeclinic.patient_number_counters IS
  'Per-HCO yearly counters for collision-safe patient_number generation (AC-YYYY-NNNNNN).';

CREATE TABLE IF NOT EXISTS activeclinic.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  date_of_birth DATE NULL,
  estimated_date_of_birth BOOLEAN NOT NULL DEFAULT false,
  sex_at_registration TEXT NULL,
  nationality_country_code TEXT NULL,
  primary_language TEXT NULL,
  phone_normalized TEXT NULL,
  phone_display TEXT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  address_line_1 TEXT NULL,
  address_line_2 TEXT NULL,
  city TEXT NULL,
  district TEXT NULL,
  province TEXT NULL,
  country_code TEXT NULL,
  postal_code TEXT NULL,
  preferred_contact_method TEXT NULL,
  allow_admin_reminders BOOLEAN NULL,
  status TEXT NOT NULL DEFAULT 'active',
  deceased_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  archive_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NULL,
  updated_by_staff_id UUID NULL,
  CONSTRAINT patients_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patients_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT patients_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT patients_hco_number_unique
    UNIQUE (healthcare_organization_id, patient_number),
  CONSTRAINT patients_created_by_staff_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patients_updated_by_staff_fk
    FOREIGN KEY (updated_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patients_patient_number_format
    CHECK (patient_number ~ '^AC-[0-9]{4}-[0-9]{6}$'),
  CONSTRAINT patients_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT patients_middle_name_len
    CHECK (middle_name IS NULL OR char_length(middle_name) BETWEEN 1 AND 100),
  CONSTRAINT patients_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT patients_preferred_name_len
    CHECK (preferred_name IS NULL OR char_length(preferred_name) BETWEEN 1 AND 100),
  CONSTRAINT patients_sex_at_registration_check
    CHECK (
      sex_at_registration IS NULL
      OR sex_at_registration IN (
        'male',
        'female',
        'intersex',
        'unknown',
        'not_recorded'
      )
    ),
  CONSTRAINT patients_nationality_country_code_format
    CHECK (
      nationality_country_code IS NULL
      OR nationality_country_code ~ '^[A-Z]{2}$'
    ),
  CONSTRAINT patients_primary_language_len
    CHECK (
      primary_language IS NULL
      OR char_length(primary_language) BETWEEN 1 AND 64
    ),
  CONSTRAINT patients_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    ),
  CONSTRAINT patients_phone_display_len
    CHECK (
      phone_display IS NULL
      OR char_length(phone_display) BETWEEN 1 AND 40
    ),
  CONSTRAINT patients_phone_pair
    CHECK (
      (phone_normalized IS NULL AND phone_display IS NULL)
      OR (phone_normalized IS NOT NULL AND phone_display IS NOT NULL)
    ),
  CONSTRAINT patients_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT patients_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    ),
  CONSTRAINT patients_email_pair
    CHECK (
      (email_normalized IS NULL AND email_display IS NULL)
      OR (email_normalized IS NOT NULL AND email_display IS NOT NULL)
    ),
  CONSTRAINT patients_address_line_1_len
    CHECK (address_line_1 IS NULL OR char_length(address_line_1) BETWEEN 1 AND 200),
  CONSTRAINT patients_address_line_2_len
    CHECK (address_line_2 IS NULL OR char_length(address_line_2) BETWEEN 1 AND 200),
  CONSTRAINT patients_city_len
    CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 120),
  CONSTRAINT patients_district_len
    CHECK (district IS NULL OR char_length(district) BETWEEN 1 AND 120),
  CONSTRAINT patients_province_len
    CHECK (province IS NULL OR char_length(province) BETWEEN 1 AND 120),
  CONSTRAINT patients_country_code_format
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT patients_postal_code_len
    CHECK (postal_code IS NULL OR char_length(postal_code) BETWEEN 1 AND 32),
  CONSTRAINT patients_preferred_contact_method_check
    CHECK (
      preferred_contact_method IS NULL
      OR preferred_contact_method IN ('phone', 'email', 'none', 'unspecified')
    ),
  CONSTRAINT patients_status_check
    CHECK (status IN ('active', 'inactive', 'deceased', 'archived')),
  CONSTRAINT patients_deceased_requires_timestamp
    CHECK (
      (status = 'deceased' AND deceased_at IS NOT NULL)
      OR (status <> 'deceased' AND deceased_at IS NULL)
    ),
  CONSTRAINT patients_archived_requires_timestamp
    CHECK (
      (status = 'archived' AND archived_at IS NOT NULL)
      OR (status <> 'archived')
    ),
  CONSTRAINT patients_archive_reason_len
    CHECK (archive_reason IS NULL OR char_length(archive_reason) BETWEEN 1 AND 200),
  CONSTRAINT patients_dob_not_future
    CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)
);

COMMENT ON TABLE activeclinic.patients IS
  'HCO-owned administrative patient records. Not platform identities; not staff; not BlessBoard members.';

CREATE INDEX IF NOT EXISTS patients_organization_id_idx
  ON activeclinic.patients (organization_id);

CREATE INDEX IF NOT EXISTS patients_hco_id_idx
  ON activeclinic.patients (healthcare_organization_id);

CREATE INDEX IF NOT EXISTS patients_hco_status_idx
  ON activeclinic.patients (healthcare_organization_id, status);

CREATE INDEX IF NOT EXISTS patients_hco_phone_idx
  ON activeclinic.patients (healthcare_organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS patients_hco_email_idx
  ON activeclinic.patients (healthcare_organization_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS patients_hco_dob_idx
  ON activeclinic.patients (healthcare_organization_id, date_of_birth)
  WHERE date_of_birth IS NOT NULL;

CREATE INDEX IF NOT EXISTS patients_hco_name_idx
  ON activeclinic.patients (
    healthcare_organization_id,
    lower(last_name),
    lower(first_name)
  );

CREATE OR REPLACE FUNCTION activeclinic.touch_patients()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.first_name := trim(NEW.first_name);
  NEW.last_name := trim(NEW.last_name);
  IF NEW.middle_name IS NOT NULL THEN
    NEW.middle_name := trim(NEW.middle_name);
  END IF;
  IF NEW.preferred_name IS NOT NULL THEN
    NEW.preferred_name := trim(NEW.preferred_name);
  END IF;
  IF NEW.phone_display IS NOT NULL THEN
    NEW.phone_display := trim(NEW.phone_display);
  END IF;
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  IF NEW.nationality_country_code IS NOT NULL THEN
    NEW.nationality_country_code := upper(trim(NEW.nationality_country_code));
  END IF;
  IF NEW.country_code IS NOT NULL THEN
    NEW.country_code := upper(trim(NEW.country_code));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_touch ON activeclinic.patients;
CREATE TRIGGER patients_touch
  BEFORE INSERT OR UPDATE ON activeclinic.patients
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_patients();

CREATE OR REPLACE FUNCTION activeclinic.prevent_patient_number_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.patient_number IS DISTINCT FROM OLD.patient_number THEN
    RAISE EXCEPTION 'activeclinic.patients.patient_number is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.healthcare_organization_id IS DISTINCT FROM OLD.healthcare_organization_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'activeclinic.patients ownership is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_number_ownership_immutable ON activeclinic.patients;
CREATE TRIGGER patients_number_ownership_immutable
  BEFORE UPDATE ON activeclinic.patients
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.prevent_patient_number_change();

CREATE OR REPLACE FUNCTION activeclinic.require_active_enrolment_for_patients()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  enrolment_status TEXT;
  hco_status TEXT;
BEGIN
  SELECT op.status
    INTO enrolment_status
    FROM platform.organization_products op
    JOIN platform.products p ON p.id = op.product_id
   WHERE op.organization_id = NEW.organization_id
     AND p.product_key = 'activeclinic'
   LIMIT 1;

  IF enrolment_status IS NULL OR enrolment_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION
      'activeclinic.patients requires active ActiveClinic enrolment for organization %',
      NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT h.status
    INTO hco_status
    FROM activeclinic.healthcare_organizations h
   WHERE h.id = NEW.healthcare_organization_id
     AND h.organization_id = NEW.organization_id;

  IF hco_status IS NULL THEN
    RAISE EXCEPTION 'patient healthcare organization ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'INSERT' AND hco_status = 'archived' THEN
    RAISE EXCEPTION 'cannot create patient under archived healthcare organization'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_require_enrolment ON activeclinic.patients;
CREATE TRIGGER patients_require_enrolment
  BEFORE INSERT OR UPDATE OF organization_id, healthcare_organization_id
  ON activeclinic.patients
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_active_enrolment_for_patients();
