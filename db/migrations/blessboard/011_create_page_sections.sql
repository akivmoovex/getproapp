-- Sections belonging to a public page. section_key immutable; plain-text body preferred.

CREATE TABLE IF NOT EXISTS blessboard.page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL
    REFERENCES blessboard.public_pages (id)
    ON DELETE RESTRICT,
  section_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  heading TEXT NULL,
  body_text TEXT NULL,
  media_url TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  layout_metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT page_sections_section_key_format
    CHECK (section_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT page_sections_section_type_format
    CHECK (section_type ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT page_sections_heading_len
    CHECK (heading IS NULL OR char_length(heading) BETWEEN 1 AND 200),
  CONSTRAINT page_sections_body_text_len
    CHECK (body_text IS NULL OR char_length(body_text) BETWEEN 1 AND 20000),
  CONSTRAINT page_sections_media_url_len
    CHECK (media_url IS NULL OR char_length(media_url) BETWEEN 1 AND 2000),
  CONSTRAINT page_sections_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT page_sections_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT page_sections_layout_metadata_object
    CHECK (layout_metadata IS NULL OR jsonb_typeof(layout_metadata) = 'object'),
  CONSTRAINT page_sections_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT page_sections_page_section_key_unique UNIQUE (page_id, section_key)
);

CREATE INDEX IF NOT EXISTS page_sections_page_id_sort_idx
  ON blessboard.page_sections (page_id, sort_order);

CREATE OR REPLACE FUNCTION blessboard.prevent_page_section_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.section_key IS DISTINCT FROM OLD.section_key THEN
    RAISE EXCEPTION 'blessboard.page_sections.section_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.page_id IS DISTINCT FROM OLD.page_id THEN
    RAISE EXCEPTION 'blessboard.page_sections.page_id is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS page_sections_keys_immutable ON blessboard.page_sections;
CREATE TRIGGER page_sections_keys_immutable
  BEFORE UPDATE ON blessboard.page_sections
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_page_section_key_change();

CREATE OR REPLACE FUNCTION blessboard.prevent_page_section_archive_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'blessboard.page_sections cannot leave archived status'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS page_sections_no_archive_reactivation ON blessboard.page_sections;
CREATE TRIGGER page_sections_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.page_sections
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_page_section_archive_reactivation();

CREATE OR REPLACE FUNCTION blessboard.require_active_scope_for_published_section()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  page_church UUID;
  page_branch UUID;
  church_status TEXT;
  branch_status TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;
  SELECT p.church_id, p.branch_id INTO page_church, page_branch
    FROM blessboard.public_pages p
   WHERE p.id = NEW.page_id;
  IF page_church IS NULL THEN
    RAISE EXCEPTION 'page_sections page % not found', NEW.page_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT c.status INTO church_status
    FROM blessboard.churches c
   WHERE c.id = page_church;
  IF church_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'published page_sections require active church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF page_branch IS NOT NULL THEN
    SELECT b.status INTO branch_status
      FROM blessboard.branches b
     WHERE b.id = page_branch;
    IF branch_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'published page_sections require active branch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS page_sections_publish_requires_active ON blessboard.page_sections;
CREATE TRIGGER page_sections_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, page_id ON blessboard.page_sections
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_section();
