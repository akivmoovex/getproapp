CREATE TABLE IF NOT EXISTS blessboard.ministries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  name TEXT NOT NULL,
  summary TEXT NULL,
  description TEXT NULL,
  meeting_day TEXT NULL,
  contact_email TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ministries_name_len
    CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT ministries_summary_len
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 500),
  CONSTRAINT ministries_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 20000),
  CONSTRAINT ministries_meeting_day_len
    CHECK (meeting_day IS NULL OR char_length(meeting_day) BETWEEN 1 AND 64),
  CONSTRAINT ministries_contact_email_len
    CHECK (contact_email IS NULL OR char_length(contact_email) BETWEEN 3 AND 254),
  CONSTRAINT ministries_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT ministries_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT ministries_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS ministries_church_sort_idx
  ON blessboard.ministries (church_id, sort_order);

DROP TRIGGER IF EXISTS ministries_branch_owns_church ON blessboard.ministries;
CREATE TRIGGER ministries_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.ministries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS ministries_publish_requires_active ON blessboard.ministries;
CREATE TRIGGER ministries_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.ministries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS ministries_no_archive_reactivation ON blessboard.ministries;
CREATE TRIGGER ministries_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.ministries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
