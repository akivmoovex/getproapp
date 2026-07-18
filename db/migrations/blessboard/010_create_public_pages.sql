-- Public website pages (church-wide or branch-scoped). Empty page shells only via explicit provision.

CREATE TABLE IF NOT EXISTS blessboard.public_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  page_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ NULL,
  layout_metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_pages_page_key_format
    CHECK (page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT public_pages_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT public_pages_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT public_pages_published_at_when_published
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT public_pages_layout_metadata_object
    CHECK (layout_metadata IS NULL OR jsonb_typeof(layout_metadata) = 'object'),
  CONSTRAINT public_pages_updated_after_created
    CHECK (updated_at >= created_at)
);

-- Church-wide pages (branch_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS public_pages_church_page_key_uq
  ON blessboard.public_pages (church_id, page_key)
  WHERE branch_id IS NULL;

-- Branch-scoped pages
CREATE UNIQUE INDEX IF NOT EXISTS public_pages_church_branch_page_key_uq
  ON blessboard.public_pages (church_id, branch_id, page_key)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS public_pages_church_id_idx
  ON blessboard.public_pages (church_id);

CREATE INDEX IF NOT EXISTS public_pages_status_idx
  ON blessboard.public_pages (status);

CREATE OR REPLACE FUNCTION blessboard.prevent_public_page_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.page_key IS DISTINCT FROM OLD.page_key THEN
    RAISE EXCEPTION 'blessboard.public_pages.page_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.church_id IS DISTINCT FROM OLD.church_id THEN
    RAISE EXCEPTION 'blessboard.public_pages.church_id is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'blessboard.public_pages.branch_id is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_pages_keys_immutable ON blessboard.public_pages;
CREATE TRIGGER public_pages_keys_immutable
  BEFORE UPDATE ON blessboard.public_pages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_public_page_key_change();

CREATE OR REPLACE FUNCTION blessboard.prevent_public_page_archive_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'blessboard.public_pages cannot leave archived status'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_pages_no_archive_reactivation ON blessboard.public_pages;
CREATE TRIGGER public_pages_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.public_pages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_public_page_archive_reactivation();

CREATE OR REPLACE FUNCTION blessboard.require_public_page_branch_belongs_to_church()
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
    RAISE EXCEPTION 'blessboard.public_pages branch % not found', NEW.branch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.public_pages branch must belong to church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_pages_branch_owns_church ON blessboard.public_pages;
CREATE TRIGGER public_pages_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.public_pages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_public_page_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.require_active_scope_for_published_page()
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
    RAISE EXCEPTION 'published public_pages require active church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.status INTO branch_status
      FROM blessboard.branches b
     WHERE b.id = NEW.branch_id;
    IF branch_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'published public_pages require active branch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_pages_publish_requires_active ON blessboard.public_pages;
CREATE TRIGGER public_pages_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id, published_at ON blessboard.public_pages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_page();
