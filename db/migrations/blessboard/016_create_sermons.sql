CREATE TABLE IF NOT EXISTS blessboard.sermons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  speaker_name TEXT NOT NULL,
  preached_at TIMESTAMPTZ NOT NULL,
  summary TEXT NULL,
  media_url TEXT NULL,
  resource_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sermons_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT sermons_speaker_name_len
    CHECK (char_length(speaker_name) BETWEEN 1 AND 200),
  CONSTRAINT sermons_summary_len
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 5000),
  CONSTRAINT sermons_media_url_len
    CHECK (media_url IS NULL OR char_length(media_url) BETWEEN 1 AND 2000),
  CONSTRAINT sermons_resource_url_len
    CHECK (resource_url IS NULL OR char_length(resource_url) BETWEEN 1 AND 2000),
  CONSTRAINT sermons_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT sermons_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS sermons_church_preached_idx
  ON blessboard.sermons (church_id, preached_at DESC);

DROP TRIGGER IF EXISTS sermons_branch_owns_church ON blessboard.sermons;
CREATE TRIGGER sermons_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.sermons
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS sermons_publish_requires_active ON blessboard.sermons;
CREATE TRIGGER sermons_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.sermons
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS sermons_no_archive_reactivation ON blessboard.sermons;
CREATE TRIGGER sermons_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.sermons
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
