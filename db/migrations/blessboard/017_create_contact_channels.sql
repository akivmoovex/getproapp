CREATE TABLE IF NOT EXISTS blessboard.contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  channel_type TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_channels_channel_type_format
    CHECK (channel_type ~ '^[a-z][a-z0-9_-]{0,31}$'),
  CONSTRAINT contact_channels_label_len
    CHECK (char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT contact_channels_value_len
    CHECK (char_length(value) BETWEEN 1 AND 500),
  CONSTRAINT contact_channels_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT contact_channels_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT contact_channels_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS contact_channels_church_sort_idx
  ON blessboard.contact_channels (church_id, sort_order);

DROP TRIGGER IF EXISTS contact_channels_branch_owns_church ON blessboard.contact_channels;
CREATE TRIGGER contact_channels_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.contact_channels
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS contact_channels_publish_requires_active ON blessboard.contact_channels;
CREATE TRIGGER contact_channels_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.contact_channels
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS contact_channels_no_archive_reactivation ON blessboard.contact_channels;
CREATE TRIGGER contact_channels_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.contact_channels
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();
