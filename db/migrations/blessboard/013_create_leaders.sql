CREATE TABLE IF NOT EXISTS blessboard.leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  biography TEXT NULL,
  image_url TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leaders_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT leaders_role_title_len
    CHECK (char_length(role_title) BETWEEN 1 AND 120),
  CONSTRAINT leaders_biography_len
    CHECK (biography IS NULL OR char_length(biography) BETWEEN 1 AND 10000),
  CONSTRAINT leaders_image_url_len
    CHECK (image_url IS NULL OR char_length(image_url) BETWEEN 1 AND 2000),
  CONSTRAINT leaders_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT leaders_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT leaders_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS leaders_church_sort_idx
  ON blessboard.leaders (church_id, sort_order);

DROP TRIGGER IF EXISTS leaders_branch_owns_church ON blessboard.leaders;
CREATE TRIGGER leaders_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.leaders
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS leaders_publish_requires_active ON blessboard.leaders;
CREATE TRIGGER leaders_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.leaders
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS leaders_no_archive_reactivation ON blessboard.leaders;
CREATE TRIGGER leaders_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.leaders
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
