-- ActiveClinic healthcare organization root (explicit; enrolment alone is not enough).
-- Mirrors BlessBoard church↔organization bridge pattern without church/branch coupling.

CREATE TABLE IF NOT EXISTS activeclinic.healthcare_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  legal_name TEXT NOT NULL,
  public_name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  registration_number TEXT NULL,
  license_number TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One healthcare root per platform organization (church-equivalent uniqueness).
  CONSTRAINT healthcare_organizations_organization_id_unique UNIQUE (organization_id),
  -- Composite uniqueness supports facility ownership FK (id + organization_id).
  CONSTRAINT healthcare_organizations_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT healthcare_organizations_legal_name_len
    CHECK (char_length(legal_name) BETWEEN 1 AND 200),
  CONSTRAINT healthcare_organizations_public_name_len
    CHECK (char_length(public_name) BETWEEN 1 AND 200),
  CONSTRAINT healthcare_organizations_organization_type_check
    CHECK (
      organization_type IN (
        'independent_facility',
        'healthcare_network',
        'faith_based_healthcare',
        'government_healthcare',
        'non_profit_healthcare',
        'private_healthcare',
        'other'
      )
    ),
  CONSTRAINT healthcare_organizations_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT healthcare_organizations_registration_number_len
    CHECK (
      registration_number IS NULL
      OR char_length(registration_number) BETWEEN 1 AND 120
    ),
  CONSTRAINT healthcare_organizations_license_number_len
    CHECK (
      license_number IS NULL
      OR char_length(license_number) BETWEEN 1 AND 120
    ),
  CONSTRAINT healthcare_organizations_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT healthcare_organizations_timezone_len
    CHECK (char_length(timezone) BETWEEN 1 AND 64)
);

COMMENT ON TABLE activeclinic.healthcare_organizations IS
  'Explicit ActiveClinic healthcare tenant root. Requires active ActiveClinic enrolment; not implied by platform.organizations alone.';

CREATE INDEX IF NOT EXISTS healthcare_organizations_organization_id_idx
  ON activeclinic.healthcare_organizations (organization_id);

CREATE INDEX IF NOT EXISTS healthcare_organizations_org_status_idx
  ON activeclinic.healthcare_organizations (organization_id, status);

CREATE INDEX IF NOT EXISTS healthcare_organizations_status_idx
  ON activeclinic.healthcare_organizations (status);

CREATE INDEX IF NOT EXISTS healthcare_organizations_country_code_idx
  ON activeclinic.healthcare_organizations (country_code);

CREATE OR REPLACE FUNCTION activeclinic.touch_healthcare_organizations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.legal_name := trim(NEW.legal_name);
  NEW.public_name := trim(NEW.public_name);
  NEW.country_code := upper(trim(NEW.country_code));
  NEW.timezone := trim(NEW.timezone);
  IF NEW.registration_number IS NOT NULL THEN
    NEW.registration_number := trim(NEW.registration_number);
  END IF;
  IF NEW.license_number IS NOT NULL THEN
    NEW.license_number := trim(NEW.license_number);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS healthcare_organizations_touch ON activeclinic.healthcare_organizations;
CREATE TRIGGER healthcare_organizations_touch
  BEFORE INSERT OR UPDATE ON activeclinic.healthcare_organizations
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_healthcare_organizations();

-- Require active ActiveClinic product enrolment (reject; never invent enrolment).
CREATE OR REPLACE FUNCTION activeclinic.require_active_activeclinic_enrolment()
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

  IF enrolment_status IS NULL THEN
    RAISE EXCEPTION
      'activeclinic.healthcare_organizations requires active ActiveClinic product enrolment for organization %',
      NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF enrolment_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION
      'activeclinic.healthcare_organizations requires active ActiveClinic enrolment (found status %)',
      enrolment_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS healthcare_organizations_require_enrolment
  ON activeclinic.healthcare_organizations;
CREATE TRIGGER healthcare_organizations_require_enrolment
  BEFORE INSERT OR UPDATE OF organization_id ON activeclinic.healthcare_organizations
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_active_activeclinic_enrolment();
