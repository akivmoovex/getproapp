CREATE TABLE IF NOT EXISTS blessboard.giving_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  method_type TEXT NOT NULL,
  label TEXT NOT NULL,
  instructions TEXT NULL,
  external_url TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT giving_methods_method_type_format
    CHECK (method_type ~ '^[a-z][a-z0-9_-]{0,31}$'),
  CONSTRAINT giving_methods_label_len
    CHECK (char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT giving_methods_instructions_len
    CHECK (instructions IS NULL OR char_length(instructions) BETWEEN 1 AND 5000),
  CONSTRAINT giving_methods_external_url_len
    CHECK (external_url IS NULL OR char_length(external_url) BETWEEN 1 AND 2000),
  CONSTRAINT giving_methods_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT giving_methods_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT giving_methods_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS giving_methods_church_sort_idx
  ON blessboard.giving_methods (church_id, sort_order);

DROP TRIGGER IF EXISTS giving_methods_branch_owns_church ON blessboard.giving_methods;
CREATE TRIGGER giving_methods_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.giving_methods
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS giving_methods_publish_requires_active ON blessboard.giving_methods;
CREATE TRIGGER giving_methods_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.giving_methods
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS giving_methods_no_archive_reactivation ON blessboard.giving_methods;
CREATE TRIGGER giving_methods_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.giving_methods
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
