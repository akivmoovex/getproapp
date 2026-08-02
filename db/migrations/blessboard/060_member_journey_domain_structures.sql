-- Member journey domain structures (additive). Reuses blessboard.ministries.
-- Does not alter CMS ministry status values (draft/published/archived).

-- ---------------------------------------------------------------------------
-- Extend ministries for journey typing + org ownership
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS ministry_key TEXT NULL;

ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS ministry_type TEXT NULL;

ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

UPDATE blessboard.ministries m
   SET organization_id = c.organization_id
  FROM blessboard.churches c
 WHERE m.church_id = c.id
   AND m.organization_id IS NULL;

UPDATE blessboard.ministries
   SET ministry_key = lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'))
 WHERE ministry_key IS NULL
   AND name IS NOT NULL;

UPDATE blessboard.ministries
   SET ministry_key = 'ministry_' || substr(replace(id::text, '-', ''), 1, 12)
 WHERE ministry_key IS NULL OR ministry_key = '';

UPDATE blessboard.ministries
   SET ministry_type = 'other'
 WHERE ministry_type IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM blessboard.ministries WHERE organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'blessboard.ministries organization_id backfill incomplete';
  END IF;
END $$;

ALTER TABLE blessboard.ministries
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE blessboard.ministries
  ALTER COLUMN ministry_key SET NOT NULL;

ALTER TABLE blessboard.ministries
  ALTER COLUMN ministry_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ministries_ministry_key_format'
       AND conrelid = 'blessboard.ministries'::regclass
  ) THEN
    ALTER TABLE blessboard.ministries
      ADD CONSTRAINT ministries_ministry_key_format
        CHECK (ministry_key ~ '^[a-z][a-z0-9_]{0,63}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ministries_ministry_type_check'
       AND conrelid = 'blessboard.ministries'::regclass
  ) THEN
    ALTER TABLE blessboard.ministries
      ADD CONSTRAINT ministries_ministry_type_check
        CHECK (ministry_type IN (
          'evangelism', 'first_timers', 'orientation', 'classes',
          'cells', 'department', 'service', 'other'
        ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ministries_church_key_uidx
  ON blessboard.ministries (church_id, ministry_key)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS ministries_org_type_idx
  ON blessboard.ministries (organization_id, ministry_type, status);

CREATE OR REPLACE FUNCTION blessboard.validate_ministry_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
BEGIN
  SELECT c.organization_id INTO church_org
    FROM blessboard.churches c
   WHERE c.id = NEW.church_id;
  IF church_org IS NULL THEN
    RAISE EXCEPTION 'blessboard.ministries church_id not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.ministries organization must match church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;
  IF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ministries_validate_organization ON blessboard.ministries;
CREATE TRIGGER ministries_validate_organization
  BEFORE INSERT OR UPDATE OF organization_id, church_id, status, archived_at
  ON blessboard.ministries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_ministry_organization();

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  ministry_id UUID NULL
    REFERENCES blessboard.ministries (id)
    ON DELETE RESTRICT,
  department_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  requirements_notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_key_format
    CHECK (department_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT departments_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT departments_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  CONSTRAINT departments_requirements_notes_len
    CHECK (requirements_notes IS NULL OR char_length(requirements_notes) BETWEEN 1 AND 2000),
  CONSTRAINT departments_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT departments_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_branch_key_live_uidx
  ON blessboard.departments (branch_id, department_key)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS departments_church_status_idx
  ON blessboard.departments (church_id, status);

CREATE OR REPLACE FUNCTION blessboard.validate_department_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  ministry_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.departments church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT b.church_id INTO branch_church FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.departments branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.ministry_id IS NOT NULL THEN
    SELECT m.church_id INTO ministry_church FROM blessboard.ministries m WHERE m.id = NEW.ministry_id;
    IF ministry_church IS NULL OR ministry_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.departments ministry/church mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departments_validate_ownership ON blessboard.departments;
CREATE TRIGGER departments_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, ministry_id, status
  ON blessboard.departments
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_department_ownership();

-- ---------------------------------------------------------------------------
-- Cells
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  cell_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  primary_leader_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  assistant_leader_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  meeting_location_summary TEXT NULL,
  meeting_schedule TEXT NULL,
  capacity INT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cells_key_format
    CHECK (cell_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT cells_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT cells_meeting_location_summary_len
    CHECK (meeting_location_summary IS NULL OR char_length(meeting_location_summary) BETWEEN 1 AND 500),
  CONSTRAINT cells_meeting_schedule_len
    CHECK (meeting_schedule IS NULL OR char_length(meeting_schedule) BETWEEN 1 AND 500),
  CONSTRAINT cells_capacity_check
    CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100000),
  CONSTRAINT cells_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT cells_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS cells_branch_key_live_uidx
  ON blessboard.cells (branch_id, cell_key)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS cells_church_status_idx
  ON blessboard.cells (church_id, status);

CREATE INDEX IF NOT EXISTS cells_leader_idx
  ON blessboard.cells (primary_leader_user_id)
  WHERE primary_leader_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION blessboard.validate_cell_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.cells church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT b.church_id INTO branch_church FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.cells branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cells_validate_ownership ON blessboard.cells;
CREATE TRIGGER cells_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, status
  ON blessboard.cells
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_cell_ownership();

-- ---------------------------------------------------------------------------
-- Class programs + cohorts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.class_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  program_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  program_type TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_programs_key_format
    CHECK (program_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT class_programs_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT class_programs_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  CONSTRAINT class_programs_type_check
    CHECK (program_type IN ('orientation', 'salvation', 'foundation', 'establishment', 'special')),
  CONSTRAINT class_programs_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT class_programs_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS class_programs_church_key_live_uidx
  ON blessboard.class_programs (church_id, program_key)
  WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS blessboard.class_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  program_id UUID NOT NULL
    REFERENCES blessboard.class_programs (id)
    ON DELETE RESTRICT,
  cohort_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  teacher_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  coordinator_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  starts_on DATE NULL,
  ends_on DATE NULL,
  capacity INT NULL,
  completion_rule TEXT NOT NULL DEFAULT 'manual_approval',
  status TEXT NOT NULL DEFAULT 'planned',
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_cohorts_key_format
    CHECK (cohort_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT class_cohorts_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT class_cohorts_capacity_check
    CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100000),
  CONSTRAINT class_cohorts_completion_rule_check
    CHECK (completion_rule IN ('manual_approval', 'attendance_threshold')),
  CONSTRAINT class_cohorts_status_check
    CHECK (status IN ('planned', 'active', 'completed', 'cancelled', 'archived')),
  CONSTRAINT class_cohorts_dates_order
    CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT class_cohorts_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS class_cohorts_branch_key_live_uidx
  ON blessboard.class_cohorts (branch_id, cohort_key)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS class_cohorts_program_status_idx
  ON blessboard.class_cohorts (program_id, status);

CREATE OR REPLACE FUNCTION blessboard.validate_class_program_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.class_programs church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_programs_validate_ownership ON blessboard.class_programs;
CREATE TRIGGER class_programs_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, status
  ON blessboard.class_programs
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_class_program_ownership();

CREATE OR REPLACE FUNCTION blessboard.validate_class_cohort_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  program_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.class_cohorts church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT b.church_id INTO branch_church FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.class_cohorts branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT p.church_id INTO program_church FROM blessboard.class_programs p WHERE p.id = NEW.program_id;
  IF program_church IS NULL OR program_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.class_cohorts program/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_cohorts_validate_ownership ON blessboard.class_cohorts;
CREATE TRIGGER class_cohorts_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, program_id, status
  ON blessboard.class_cohorts
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_class_cohort_ownership();
