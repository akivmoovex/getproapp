-- Shared helpers for church/branch-owned public content rows.

CREATE OR REPLACE FUNCTION blessboard.require_content_branch_belongs_to_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  branch_church UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT b.church_id INTO branch_church
    FROM blessboard.branches b
   WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL THEN
    RAISE EXCEPTION 'content branch % not found', NEW.branch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'content branch must belong to church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION blessboard.require_active_scope_for_published_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_status TEXT;
  branch_status TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;

  SELECT c.status INTO church_status
    FROM blessboard.churches c
   WHERE c.id = NEW.church_id;
  IF church_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'published content requires active church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.status INTO branch_status
      FROM blessboard.branches b
     WHERE b.id = NEW.branch_id;
    IF branch_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'published content requires active branch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION blessboard.prevent_content_archive_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'archived content cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
