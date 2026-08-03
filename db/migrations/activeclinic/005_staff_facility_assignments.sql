-- AC-V6-06: staff ↔ facility assignments (multi-facility employment).

-- Composite uniqueness required for ownership FKs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'facilities_id_org_unique'
  ) THEN
    ALTER TABLE activeclinic.facilities
      ADD CONSTRAINT facilities_id_org_unique UNIQUE (id, organization_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activeclinic.staff_facility_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_facility_assignments_staff_fk
    FOREIGN KEY (staff_member_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_facility_assignments_facility_fk
    FOREIGN KEY (facility_id, organization_id)
    REFERENCES activeclinic.facilities (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_facility_assignments_hco_match
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_facility_assignments_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT staff_facility_assignments_ends_after_starts
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

COMMENT ON TABLE activeclinic.staff_facility_assignments IS
  'Multi-facility staff placement. Facility-scoped RBAC requires an active matching assignment.';

CREATE UNIQUE INDEX IF NOT EXISTS staff_facility_assignments_active_uidx
  ON activeclinic.staff_facility_assignments (staff_member_id, facility_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS staff_facility_assignments_one_primary_uidx
  ON activeclinic.staff_facility_assignments (staff_member_id)
  WHERE is_primary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS staff_facility_assignments_org_idx
  ON activeclinic.staff_facility_assignments (organization_id);

CREATE INDEX IF NOT EXISTS staff_facility_assignments_facility_idx
  ON activeclinic.staff_facility_assignments (facility_id, status);

CREATE INDEX IF NOT EXISTS staff_facility_assignments_staff_idx
  ON activeclinic.staff_facility_assignments (staff_member_id, status);

CREATE OR REPLACE FUNCTION activeclinic.touch_staff_facility_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_facility_assignments_touch
  ON activeclinic.staff_facility_assignments;
CREATE TRIGGER staff_facility_assignments_touch
  BEFORE INSERT OR UPDATE ON activeclinic.staff_facility_assignments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_staff_facility_assignments();

CREATE OR REPLACE FUNCTION activeclinic.require_staff_facility_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  staff_hco UUID;
  facility_hco UUID;
  facility_status TEXT;
BEGIN
  SELECT s.healthcare_organization_id
    INTO staff_hco
    FROM activeclinic.staff_members s
   WHERE s.id = NEW.staff_member_id
     AND s.organization_id = NEW.organization_id;

  SELECT f.healthcare_organization_id, f.status
    INTO facility_hco, facility_status
    FROM activeclinic.facilities f
   WHERE f.id = NEW.facility_id
     AND f.organization_id = NEW.organization_id;

  IF staff_hco IS NULL OR facility_hco IS NULL THEN
    RAISE EXCEPTION 'staff facility assignment ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF staff_hco IS DISTINCT FROM facility_hco
     OR staff_hco IS DISTINCT FROM NEW.healthcare_organization_id THEN
    RAISE EXCEPTION 'staff and facility must share healthcare organization'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'INSERT' AND facility_status = 'archived' THEN
    RAISE EXCEPTION 'cannot assign staff to archived facility'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_facility_assignments_ownership
  ON activeclinic.staff_facility_assignments;
CREATE TRIGGER staff_facility_assignments_ownership
  BEFORE INSERT OR UPDATE OF organization_id, healthcare_organization_id,
    staff_member_id, facility_id
  ON activeclinic.staff_facility_assignments
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.require_staff_facility_ownership();
