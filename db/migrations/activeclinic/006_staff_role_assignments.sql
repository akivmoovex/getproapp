-- AC-V6-06: ActiveClinic staff role assignments (authorization subject = staff_members).
-- Reuses blessboard.roles / permissions catalogue; does not alter BlessBoard user assignments.

CREATE TABLE IF NOT EXISTS activeclinic.staff_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  role_id UUID NOT NULL
    REFERENCES blessboard.roles (id)
    ON DELETE RESTRICT,
  scope_type TEXT NOT NULL,
  scope_id UUID NULL,
  facility_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assignment_origin TEXT NOT NULL DEFAULT 'manual',
  assignment_reason TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  assigned_by_platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE RESTRICT,
  revoked_by_platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE RESTRICT,
  revocation_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_role_assignments_staff_fk
    FOREIGN KEY (staff_member_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_role_assignments_hco_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_role_assignments_scope_type_check
    CHECK (scope_type IN ('organisation', 'facility')),
  CONSTRAINT staff_role_assignments_status_check
    CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT staff_role_assignments_origin_check
    CHECK (
      assignment_origin IN ('system', 'manual', 'migration', 'support', 'invitation')
    ),
  CONSTRAINT staff_role_assignments_organisation_scope
    CHECK (
      scope_type <> 'organisation'
      OR (
        facility_id IS NULL
        AND (scope_id IS NULL OR scope_id = organization_id)
      )
    ),
  CONSTRAINT staff_role_assignments_facility_scope
    CHECK (
      scope_type <> 'facility'
      OR (facility_id IS NOT NULL AND scope_id = facility_id)
    ),
  CONSTRAINT staff_role_assignments_revoked_consistency
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (
        status <> 'revoked'
        AND revoked_at IS NULL
        AND revoked_by_platform_identity_id IS NULL
        AND revocation_reason IS NULL
      )
    ),
  CONSTRAINT staff_role_assignments_reason_len
    CHECK (
      assignment_reason IS NULL
      OR char_length(assignment_reason) BETWEEN 1 AND 500
    ),
  CONSTRAINT staff_role_assignments_revocation_reason_len
    CHECK (
      revocation_reason IS NULL
      OR char_length(revocation_reason) BETWEEN 1 AND 500
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'staff_role_assignments_facility_fk'
  ) THEN
    ALTER TABLE activeclinic.staff_role_assignments
      ADD CONSTRAINT staff_role_assignments_facility_fk
      FOREIGN KEY (facility_id, organization_id)
      REFERENCES activeclinic.facilities (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_role_assignments_active_scope_uidx
  ON activeclinic.staff_role_assignments (
    staff_member_id,
    organization_id,
    role_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS staff_role_assignments_staff_org_status_idx
  ON activeclinic.staff_role_assignments (staff_member_id, organization_id, status);

CREATE INDEX IF NOT EXISTS staff_role_assignments_org_role_idx
  ON activeclinic.staff_role_assignments (organization_id, role_id, status);

CREATE INDEX IF NOT EXISTS staff_role_assignments_expires_idx
  ON activeclinic.staff_role_assignments (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION activeclinic.touch_staff_role_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_role_assignments_touch ON activeclinic.staff_role_assignments;
CREATE TRIGGER staff_role_assignments_touch
  BEFORE INSERT OR UPDATE ON activeclinic.staff_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_staff_role_assignments();

CREATE OR REPLACE FUNCTION activeclinic.require_staff_role_assignment_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  staff_hco UUID;
  facility_hco UUID;
BEGIN
  SELECT s.healthcare_organization_id
    INTO staff_hco
    FROM activeclinic.staff_members s
   WHERE s.id = NEW.staff_member_id
     AND s.organization_id = NEW.organization_id;

  IF staff_hco IS NULL OR staff_hco IS DISTINCT FROM NEW.healthcare_organization_id THEN
    RAISE EXCEPTION 'staff role assignment healthcare organization mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.facility_id IS NOT NULL THEN
    SELECT f.healthcare_organization_id
      INTO facility_hco
      FROM activeclinic.facilities f
     WHERE f.id = NEW.facility_id
       AND f.organization_id = NEW.organization_id;
    IF facility_hco IS NULL OR facility_hco IS DISTINCT FROM NEW.healthcare_organization_id THEN
      RAISE EXCEPTION 'facility scope ownership mismatch for staff role assignment'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_role_assignments_ownership
  ON activeclinic.staff_role_assignments;
CREATE TRIGGER staff_role_assignments_ownership
  BEFORE INSERT OR UPDATE OF organization_id, healthcare_organization_id,
    staff_member_id, facility_id, scope_type, scope_id
  ON activeclinic.staff_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_staff_role_assignment_ownership();
