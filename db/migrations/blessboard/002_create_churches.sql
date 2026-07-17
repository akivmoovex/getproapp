-- BlessBoard church catalogue: one product church per platform organization.
-- organization_id is the permanent UUID bridge to platform.organizations.
-- Product enrolment is not duplicated here; triggers require active BlessBoard enrolment.

CREATE TABLE IF NOT EXISTS blessboard.churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  data_environment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT churches_organization_id_unique UNIQUE (organization_id),
  CONSTRAINT churches_church_key_unique UNIQUE (church_key),
  CONSTRAINT churches_church_key_format
    CHECK (church_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT churches_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT churches_legal_name_len
    CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 200),
  CONSTRAINT churches_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT churches_data_environment_check
    CHECK (data_environment IN ('production', 'pilot', 'demo', 'testing'))
);

CREATE INDEX IF NOT EXISTS churches_status_idx
  ON blessboard.churches (status);

CREATE INDEX IF NOT EXISTS churches_data_environment_idx
  ON blessboard.churches (data_environment);

CREATE OR REPLACE FUNCTION blessboard.prevent_church_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.church_key IS DISTINCT FROM OLD.church_key THEN
    RAISE EXCEPTION 'blessboard.churches.church_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_church_key_immutable ON blessboard.churches;
CREATE TRIGGER churches_church_key_immutable
  BEFORE UPDATE ON blessboard.churches
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_church_key_change();

-- Require active BlessBoard product enrolment for the organization.
CREATE OR REPLACE FUNCTION blessboard.require_active_blessboard_enrolment()
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
     AND p.product_key = 'blessboard'
   LIMIT 1;

  IF enrolment_status IS NULL THEN
    RAISE EXCEPTION 'blessboard.churches requires active BlessBoard product enrolment for organization %',
      NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF enrolment_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'blessboard.churches requires active BlessBoard enrolment (found status %)',
      enrolment_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_require_blessboard_enrolment ON blessboard.churches;
CREATE TRIGGER churches_require_blessboard_enrolment
  BEFORE INSERT OR UPDATE OF organization_id ON blessboard.churches
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_blessboard_enrolment();

-- Church data_environment must match platform.organizations.data_environment (reject, never rewrite).
CREATE OR REPLACE FUNCTION blessboard.require_organization_data_environment_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_env TEXT;
BEGIN
  SELECT o.data_environment
    INTO org_env
    FROM platform.organizations o
   WHERE o.id = NEW.organization_id;

  IF org_env IS NULL THEN
    RAISE EXCEPTION 'blessboard.churches organization % not found for environment check',
      NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.data_environment IS DISTINCT FROM org_env THEN
    RAISE EXCEPTION
      'blessboard.churches.data_environment (%) must match platform.organizations.data_environment (%)',
      NEW.data_environment, org_env
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_require_organization_environment ON blessboard.churches;
CREATE TRIGGER churches_require_organization_environment
  BEFORE INSERT OR UPDATE OF organization_id, data_environment ON blessboard.churches
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_organization_data_environment_match();
