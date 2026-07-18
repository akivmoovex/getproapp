CREATE TABLE IF NOT EXISTS blessboard.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  summary TEXT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NULL,
  timezone TEXT NOT NULL,
  location TEXT NULL,
  registration_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT events_summary_len
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 1000),
  CONSTRAINT events_timezone_len
    CHECK (char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT events_location_len
    CHECK (location IS NULL OR char_length(location) BETWEEN 1 AND 300),
  CONSTRAINT events_registration_url_len
    CHECK (registration_url IS NULL OR char_length(registration_url) BETWEEN 1 AND 2000),
  CONSTRAINT events_status_check
    CHECK (status IN ('draft', 'published', 'cancelled', 'archived')),
  CONSTRAINT events_ends_after_starts
    CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT events_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS events_church_starts_idx
  ON blessboard.events (church_id, starts_at DESC);

DROP TRIGGER IF EXISTS events_branch_owns_church ON blessboard.events;
CREATE TRIGGER events_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS events_publish_requires_active ON blessboard.events;
CREATE TRIGGER events_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS events_no_archive_reactivation ON blessboard.events;
CREATE TRIGGER events_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
