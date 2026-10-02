-- BlessBoard V5 RBAC foundation: scoped user-role assignments (additive).
-- Does not alter blessboard.user_roles. Prefer revoke over hard delete.

CREATE TABLE IF NOT EXISTS blessboard.user_role_assignments (
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
  role_id UUID NOT NULL
    REFERENCES blessboard.roles (id)
    ON DELETE RESTRICT,
  scope_type TEXT NOT NULL,
  scope_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  assignment_origin TEXT NOT NULL,
  assignment_reason TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  revocation_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_role_assignments_scope_type_check
    CHECK (scope_type IN ('platform', 'organisation', 'church', 'branch', 'personal')),
  CONSTRAINT user_role_assignments_status_check
    CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT user_role_assignments_origin_check
    CHECK (assignment_origin IN ('system', 'legacy_compatibility', 'manual', 'migration', 'support')),
  CONSTRAINT user_role_assignments_reason_len
    CHECK (assignment_reason IS NULL OR char_length(assignment_reason) BETWEEN 1 AND 500),
  CONSTRAINT user_role_assignments_revocation_reason_len
    CHECK (revocation_reason IS NULL OR char_length(revocation_reason) BETWEEN 1 AND 500),
  CONSTRAINT user_role_assignments_platform_scope
    CHECK (
      scope_type <> 'platform'
      OR (church_id IS NULL AND scope_id IS NULL)
    ),
  CONSTRAINT user_role_assignments_organisation_scope
    CHECK (
      scope_type <> 'organisation'
      OR (church_id IS NULL AND (scope_id IS NULL OR scope_id = organization_id))
    ),
  CONSTRAINT user_role_assignments_church_scope
    CHECK (
      scope_type <> 'church'
      OR (church_id IS NOT NULL AND scope_id = church_id)
    ),
  CONSTRAINT user_role_assignments_branch_scope
    CHECK (
      scope_type <> 'branch'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    ),
  CONSTRAINT user_role_assignments_personal_scope
    CHECK (
      scope_type <> 'personal'
      OR (scope_id = user_id)
    ),
  CONSTRAINT user_role_assignments_revoked_consistency
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
    ),
  CONSTRAINT user_role_assignments_updated_after_created
    CHECK (updated_at >= created_at)
);

-- One active assignment per user/org/role/scope (NULL-safe).
CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_active_scope_uidx
  ON blessboard.user_role_assignments (
    user_id,
    organization_id,
    role_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(church_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS user_role_assignments_user_org_status_idx
  ON blessboard.user_role_assignments (user_id, organization_id, status);

CREATE INDEX IF NOT EXISTS user_role_assignments_org_role_scope_idx
  ON blessboard.user_role_assignments (organization_id, role_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS user_role_assignments_role_status_idx
  ON blessboard.user_role_assignments (role_id, status);

CREATE INDEX IF NOT EXISTS user_role_assignments_active_expires_idx
  ON blessboard.user_role_assignments (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION blessboard.validate_user_role_assignment_ownership()
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
      RAISE EXCEPTION 'blessboard.user_role_assignments church_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF church_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments church must belong to organization'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'branch' THEN
    SELECT b.church_id INTO branch_church
      FROM blessboard.branches b
     WHERE b.id = NEW.scope_id;
    IF branch_church IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments branch scope_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.church_id IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments branch must belong to church'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'church' AND NEW.scope_id IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments church scope_id must equal church_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.scope_type = 'organisation' AND NEW.scope_id IS NOT NULL
     AND NEW.scope_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments organisation scope_id must equal organization_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.scope_type = 'personal' AND NEW.scope_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments personal scope_id must equal user_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_role_assignments_validate_ownership ON blessboard.user_role_assignments;
CREATE TRIGGER user_role_assignments_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, scope_type, scope_id, user_id, role_id
  ON blessboard.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_user_role_assignment_ownership();
