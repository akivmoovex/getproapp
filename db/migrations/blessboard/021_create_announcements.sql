-- BlessBoard V5 announcements + audiences + reads + media attachments.
-- branch_id NULL = church-wide; status is soft lifecycle (no hard delete).

CREATE TABLE IF NOT EXISTS blessboard.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  featured_until TIMESTAMPTZ NULL,
  action_url TEXT NULL,
  action_label TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT announcements_body_len
    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT announcements_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT announcements_action_url_len
    CHECK (action_url IS NULL OR char_length(action_url) BETWEEN 1 AND 2000),
  CONSTRAINT announcements_action_label_len
    CHECK (action_label IS NULL OR char_length(action_label) BETWEEN 1 AND 100),
  CONSTRAINT announcements_action_pair
    CHECK (
      (action_url IS NULL AND action_label IS NULL)
      OR (action_url IS NOT NULL AND action_label IS NOT NULL)
    ),
  CONSTRAINT announcements_published_at_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT announcements_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS announcements_church_status_published_idx
  ON blessboard.announcements (church_id, status, is_pinned DESC, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS announcements_church_branch_status_idx
  ON blessboard.announcements (church_id, branch_id, status)
  WHERE branch_id IS NOT NULL;

DROP TRIGGER IF EXISTS announcements_branch_owns_church ON blessboard.announcements;
CREATE TRIGGER announcements_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.announcements
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS announcements_publish_requires_active ON blessboard.announcements;
CREATE TRIGGER announcements_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.announcements
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS announcements_no_archive_reactivation ON blessboard.announcements;
CREATE TRIGGER announcements_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.announcements
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();

-- ---------------------------------------------------------------------------
-- Audiences: members and/or admins (multi-audience via rows)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.announcement_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL
    REFERENCES blessboard.announcements (id)
    ON DELETE CASCADE,
  audience_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcement_audiences_key_check
    CHECK (audience_key IN ('members', 'admins')),
  CONSTRAINT announcement_audiences_unique
    UNIQUE (announcement_id, audience_key)
);

CREATE INDEX IF NOT EXISTS announcement_audiences_announcement_idx
  ON blessboard.announcement_audiences (announcement_id);

-- ---------------------------------------------------------------------------
-- Read receipts (member-scoped; delivery counts derived in services)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  announcement_id UUID NOT NULL
    REFERENCES blessboard.announcements (id)
    ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcement_reads_member_announcement_unique
    UNIQUE (member_id, announcement_id),
  CONSTRAINT announcement_reads_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT announcement_reads_read_after_seen
    CHECK (read_at IS NULL OR read_at >= first_seen_at)
);

CREATE INDEX IF NOT EXISTS announcement_reads_announcement_idx
  ON blessboard.announcement_reads (announcement_id, read_at);

CREATE INDEX IF NOT EXISTS announcement_reads_church_member_idx
  ON blessboard.announcement_reads (church_id, member_id);

CREATE OR REPLACE FUNCTION blessboard.require_announcement_read_church_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  announcement_church UUID;
  member_church UUID;
BEGIN
  SELECT a.church_id INTO announcement_church
    FROM blessboard.announcements a
   WHERE a.id = NEW.announcement_id;
  IF announcement_church IS NULL THEN
    RAISE EXCEPTION 'announcement % not found for read', NEW.announcement_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF announcement_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'announcement read church must match announcement'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found for read', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'announcement read church must match member'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcement_reads_church_match ON blessboard.announcement_reads;
CREATE TRIGGER announcement_reads_church_match
  BEFORE INSERT OR UPDATE OF church_id, announcement_id, member_id
  ON blessboard.announcement_reads
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_announcement_read_church_match();

-- ---------------------------------------------------------------------------
-- Attachments via media_assets (metadata link only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.announcement_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL
    REFERENCES blessboard.announcements (id)
    ON DELETE CASCADE,
  media_asset_id UUID NOT NULL
    REFERENCES blessboard.media_assets (id)
    ON DELETE RESTRICT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcement_attachments_sort_order_range
    CHECK (sort_order >= 0 AND sort_order <= 1000),
  CONSTRAINT announcement_attachments_unique
    UNIQUE (announcement_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS announcement_attachments_announcement_idx
  ON blessboard.announcement_attachments (announcement_id, sort_order ASC);

CREATE OR REPLACE FUNCTION blessboard.require_announcement_attachment_church_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  announcement_church UUID;
  asset_church UUID;
  asset_status TEXT;
BEGIN
  SELECT a.church_id INTO announcement_church
    FROM blessboard.announcements a
   WHERE a.id = NEW.announcement_id;
  IF announcement_church IS NULL THEN
    RAISE EXCEPTION 'announcement % not found for attachment', NEW.announcement_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT m.church_id, m.status INTO asset_church, asset_status
    FROM blessboard.media_assets m
   WHERE m.id = NEW.media_asset_id;
  IF asset_church IS NULL THEN
    RAISE EXCEPTION 'media asset % not found for attachment', NEW.media_asset_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF asset_church IS DISTINCT FROM announcement_church THEN
    RAISE EXCEPTION 'announcement attachment media must belong to same church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF asset_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'announcement attachment requires active media asset'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcement_attachments_church_match ON blessboard.announcement_attachments;
CREATE TRIGGER announcement_attachments_church_match
  BEFORE INSERT OR UPDATE OF announcement_id, media_asset_id
  ON blessboard.announcement_attachments
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_announcement_attachment_church_match();
