-- ActiveClinic facilities under an explicit healthcare organization root.
-- Ownership: (healthcare_organization_id, organization_id) composite FK.

CREATE TABLE IF NOT EXISTS activeclinic.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT NULL,
  facility_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  country_code TEXT NOT NULL,
  province TEXT NULL,
  district TEXT NULL,
  city TEXT NULL,
  address_line_1 TEXT NULL,
  address_line_2 TEXT NULL,
  postal_code TEXT NULL,
  phone_normalized TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facilities_healthcare_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT facilities_hco_facility_key_unique
    UNIQUE (healthcare_organization_id, facility_key),
  CONSTRAINT facilities_facility_key_format
    CHECK (facility_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT facilities_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT facilities_legal_name_len
    CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 200),
  CONSTRAINT facilities_facility_type_check
    CHECK (
      facility_type IN (
        'hospital',
        'health_centre',
        'clinic',
        'diagnostic_centre',
        'pharmacy',
        'mobile_clinic',
        'administrative_office',
        'other'
      )
    ),
  CONSTRAINT facilities_status_check
    CHECK (status IN ('planned', 'active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT facilities_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT facilities_province_len
    CHECK (province IS NULL OR char_length(province) BETWEEN 1 AND 120),
  CONSTRAINT facilities_district_len
    CHECK (district IS NULL OR char_length(district) BETWEEN 1 AND 120),
  CONSTRAINT facilities_city_len
    CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 120),
  CONSTRAINT facilities_address_line_1_len
    CHECK (address_line_1 IS NULL OR char_length(address_line_1) BETWEEN 1 AND 200),
  CONSTRAINT facilities_address_line_2_len
    CHECK (address_line_2 IS NULL OR char_length(address_line_2) BETWEEN 1 AND 200),
  CONSTRAINT facilities_postal_code_len
    CHECK (postal_code IS NULL OR char_length(postal_code) BETWEEN 1 AND 32),
  CONSTRAINT facilities_phone_normalized_format
    CHECK (
      phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(phone_normalized) BETWEEN 8 AND 20
    ),
  CONSTRAINT facilities_phone_display_len
    CHECK (char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT facilities_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT facilities_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    ),
  CONSTRAINT facilities_timezone_len
    CHECK (char_length(timezone) BETWEEN 1 AND 64)
);

COMMENT ON TABLE activeclinic.facilities IS
  'ActiveClinic care delivery / admin sites. Scoped to healthcare_organizations; never BlessBoard branches.';

CREATE INDEX IF NOT EXISTS facilities_organization_id_idx
  ON activeclinic.facilities (organization_id);

CREATE INDEX IF NOT EXISTS facilities_healthcare_organization_id_idx
  ON activeclinic.facilities (healthcare_organization_id);

CREATE INDEX IF NOT EXISTS facilities_org_status_idx
  ON activeclinic.facilities (organization_id, status);

CREATE INDEX IF NOT EXISTS facilities_hco_status_idx
  ON activeclinic.facilities (healthcare_organization_id, status);

-- Lookup by org + key (secondary to unique on hco+key).
CREATE INDEX IF NOT EXISTS facilities_org_facility_key_idx
  ON activeclinic.facilities (organization_id, facility_key);

-- At most one active primary facility per healthcare organization.
-- Archived/inactive primaries do not block a new active primary.
CREATE UNIQUE INDEX IF NOT EXISTS facilities_one_active_primary_per_hco_uidx
  ON activeclinic.facilities (healthcare_organization_id)
  WHERE is_primary = true AND status = 'active';

CREATE OR REPLACE FUNCTION activeclinic.touch_facilities()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.facility_key := lower(trim(NEW.facility_key));
  NEW.display_name := trim(NEW.display_name);
  NEW.country_code := upper(trim(NEW.country_code));
  NEW.timezone := trim(NEW.timezone);
  NEW.phone_display := trim(NEW.phone_display);
  IF NEW.legal_name IS NOT NULL THEN
    NEW.legal_name := trim(NEW.legal_name);
  END IF;
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facilities_touch ON activeclinic.facilities;
CREATE TRIGGER facilities_touch
  BEFORE INSERT OR UPDATE ON activeclinic.facilities
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_facilities();

CREATE OR REPLACE FUNCTION activeclinic.prevent_facility_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.facility_key IS DISTINCT FROM OLD.facility_key THEN
    RAISE EXCEPTION 'activeclinic.facilities.facility_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facilities_facility_key_immutable ON activeclinic.facilities;
CREATE TRIGGER facilities_facility_key_immutable
  BEFORE UPDATE ON activeclinic.facilities
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.prevent_facility_key_change();

-- Facilities also require active ActiveClinic enrolment (defence in depth).
CREATE OR REPLACE FUNCTION activeclinic.require_active_activeclinic_enrolment_for_facility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  enrolment_status TEXT;
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
      'activeclinic.facilities requires active ActiveClinic product enrolment for organization %',
      NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facilities_require_enrolment ON activeclinic.facilities;
CREATE TRIGGER facilities_require_enrolment
  BEFORE INSERT OR UPDATE OF organization_id ON activeclinic.facilities
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_active_activeclinic_enrolment_for_facility();
