-- V5 user role assignments scoped to organization / church / branch UUIDs.

CREATE TABLE IF NOT EXISTS blessboard.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  role_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_role_key_check
    CHECK (role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')),
  CONSTRAINT user_roles_status_check
    CHECK (status IN ('active', 'inactive', 'suspended')),
  CONSTRAINT user_roles_scope_unique
    UNIQUE NULLS NOT DISTINCT (user_id, organization_id, church_id, branch_id, role_key),
  CONSTRAINT user_roles_platform_admin_scope
    CHECK (
      role_key <> 'platform_admin'
      OR (church_id IS NULL AND branch_id IS NULL)
    ),
  CONSTRAINT user_roles_hq_admin_scope
    CHECK (
      role_key <> 'church_hq_admin'
      OR (church_id IS NOT NULL AND branch_id IS NULL)
    ),
  CONSTRAINT user_roles_branch_admin_scope
    CHECK (
      role_key <> 'branch_admin'
      OR (church_id IS NOT NULL AND branch_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx
  ON blessboard.user_roles (user_id);

CREATE INDEX IF NOT EXISTS user_roles_organization_id_idx
  ON blessboard.user_roles (organization_id);

CREATE OR REPLACE FUNCTION blessboard.validate_user_role_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  IF NEW.church_id IS NOT NULL THEN
    SELECT c.organization_id INTO church_org
      FROM blessboard.churches c
     WHERE c.id = NEW.church_id;
    IF church_org IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_roles church_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF church_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'blessboard.user_roles church must belong to organization'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.church_id INTO branch_church
      FROM blessboard.branches b
     WHERE b.id = NEW.branch_id;
    IF branch_church IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_roles branch_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.church_id IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_roles branch must belong to church'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_validate_ownership ON blessboard.user_roles;
CREATE TRIGGER user_roles_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, role_key ON blessboard.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_user_role_ownership();
