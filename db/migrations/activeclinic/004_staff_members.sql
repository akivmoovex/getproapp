-- AC-V6-06: ActiveClinic staff members (employment profile; not auth principal).

CREATE TABLE IF NOT EXISTS activeclinic.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE RESTRICT,
  staff_number TEXT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  display_name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  job_title TEXT NULL,
  employment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  start_date DATE NULL,
  end_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_members_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_members_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT staff_members_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT staff_members_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT staff_members_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT staff_members_preferred_name_len
    CHECK (preferred_name IS NULL OR char_length(preferred_name) BETWEEN 1 AND 100),
  CONSTRAINT staff_members_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT staff_members_staff_number_len
    CHECK (staff_number IS NULL OR char_length(staff_number) BETWEEN 1 AND 64),
  CONSTRAINT staff_members_job_title_len
    CHECK (job_title IS NULL OR char_length(job_title) BETWEEN 1 AND 120),
  CONSTRAINT staff_members_phone_normalized_format
    CHECK (
      phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(phone_normalized) BETWEEN 8 AND 20
    ),
  CONSTRAINT staff_members_phone_display_len
    CHECK (char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT staff_members_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT staff_members_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    ),
  CONSTRAINT staff_members_employment_type_check
    CHECK (
      employment_type IN (
        'permanent',
        'contract',
        'temporary',
        'volunteer',
        'visiting',
        'agency',
        'other'
      )
    ),
  CONSTRAINT staff_members_status_check
    CHECK (status IN ('invited', 'active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT staff_members_end_after_start
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE activeclinic.staff_members IS
  'ActiveClinic employment/profile subject for RBAC. Authentication remains on platform.identities.';

CREATE INDEX IF NOT EXISTS staff_members_organization_id_idx
  ON activeclinic.staff_members (organization_id);

CREATE INDEX IF NOT EXISTS staff_members_hco_id_idx
  ON activeclinic.staff_members (healthcare_organization_id);

CREATE INDEX IF NOT EXISTS staff_members_org_status_idx
  ON activeclinic.staff_members (organization_id, status);

CREATE INDEX IF NOT EXISTS staff_members_identity_idx
  ON activeclinic.staff_members (platform_identity_id)
  WHERE platform_identity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_members_org_staff_number_uidx
  ON activeclinic.staff_members (organization_id, staff_number)
  WHERE staff_number IS NOT NULL;

-- One non-archived staff profile per identity within a healthcare organization.
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_hco_identity_live_uidx
  ON activeclinic.staff_members (healthcare_organization_id, platform_identity_id)
  WHERE platform_identity_id IS NOT NULL
    AND status IN ('invited', 'active', 'inactive', 'suspended');

CREATE OR REPLACE FUNCTION activeclinic.touch_staff_members()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.first_name := trim(NEW.first_name);
  NEW.last_name := trim(NEW.last_name);
  NEW.display_name := trim(NEW.display_name);
  NEW.phone_display := trim(NEW.phone_display);
  IF NEW.preferred_name IS NOT NULL THEN
    NEW.preferred_name := trim(NEW.preferred_name);
  END IF;
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  IF NEW.staff_number IS NOT NULL THEN
    NEW.staff_number := trim(NEW.staff_number);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_members_touch ON activeclinic.staff_members;
CREATE TRIGGER staff_members_touch
  BEFORE INSERT OR UPDATE ON activeclinic.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_staff_members();

CREATE OR REPLACE FUNCTION activeclinic.require_active_enrolment_for_staff()
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
      'activeclinic.staff_members requires active ActiveClinic enrolment for organization %',
      NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT h.status
    INTO hco_status
    FROM activeclinic.healthcare_organizations h
   WHERE h.id = NEW.healthcare_organization_id
     AND h.organization_id = NEW.organization_id;

  IF hco_status IS NULL THEN
    RAISE EXCEPTION 'staff healthcare organization ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'INSERT' AND hco_status = 'archived' THEN
    RAISE EXCEPTION 'cannot create staff under archived healthcare organization'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_members_require_enrolment ON activeclinic.staff_members;
CREATE TRIGGER staff_members_require_enrolment
  BEFORE INSERT OR UPDATE OF organization_id, healthcare_organization_id
  ON activeclinic.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_active_enrolment_for_staff();
