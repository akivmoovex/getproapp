-- Thin shared tenant identity. Product-specific org details live in product schemas.
-- Branches are intentionally not shared (meaning differs by product).
-- organization_key is immutable after insert (enforced by trigger).

CREATE TABLE IF NOT EXISTS platform.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  data_environment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizations_organization_key_unique UNIQUE (organization_key),
  CONSTRAINT organizations_organization_key_format
    CHECK (organization_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT organizations_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT organizations_legal_name_len
    CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 200),
  CONSTRAINT organizations_status_check
    CHECK (status IN ('active', 'inactive', 'retired')),
  CONSTRAINT organizations_data_environment_check
    CHECK (data_environment IN ('production', 'pilot', 'demo', 'testing'))
);

CREATE INDEX IF NOT EXISTS organizations_status_idx
  ON platform.organizations (status);

CREATE INDEX IF NOT EXISTS organizations_data_environment_idx
  ON platform.organizations (data_environment);

CREATE OR REPLACE FUNCTION platform.prevent_organization_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_key IS DISTINCT FROM OLD.organization_key THEN
    RAISE EXCEPTION 'platform.organizations.organization_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_organization_key_immutable ON platform.organizations;
CREATE TRIGGER organizations_organization_key_immutable
  BEFORE UPDATE ON platform.organizations
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_organization_key_change();
