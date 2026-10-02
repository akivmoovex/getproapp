-- Additive V8 shared tenant announcements (AN01–AN05).
-- Draft / scheduled / published / expired / archived with starts/ends + timezone.
-- Publication history append-only. No background worker required —
-- scheduled→visible is evaluated lazily at read time.
-- Idempotent. Not applied overnight on hosted DB.

CREATE TABLE IF NOT EXISTS platform.tenant_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL,
  unpublished_at TIMESTAMPTZ NULL,
  media_asset_ref TEXT NULL,
  media_url TEXT NULL,
  branch_id UUID NULL,
  facility_id UUID NULL,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_announcements_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT tenant_announcements_status_check
    CHECK (status IN ('draft', 'scheduled', 'published', 'expired', 'archived')),
  CONSTRAINT tenant_announcements_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT tenant_announcements_body_len
    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT tenant_announcements_timezone_len
    CHECK (char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT tenant_announcements_media_asset_ref_len
    CHECK (media_asset_ref IS NULL OR char_length(media_asset_ref) BETWEEN 1 AND 200),
  CONSTRAINT tenant_announcements_media_url_len
    CHECK (media_url IS NULL OR char_length(media_url) BETWEEN 1 AND 2000),
  CONSTRAINT tenant_announcements_ends_after_starts
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT tenant_announcements_scheduled_requires_start
    CHECK (status <> 'scheduled' OR starts_at IS NOT NULL),
  CONSTRAINT tenant_announcements_published_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT tenant_announcements_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS tenant_announcements_org_product_status_idx
  ON platform.tenant_announcements (
    organization_id, product_code, status, updated_at DESC
  );

CREATE INDEX IF NOT EXISTS tenant_announcements_org_starts_idx
  ON platform.tenant_announcements (organization_id, product_code, starts_at)
  WHERE starts_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.tenant_announcement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL
    REFERENCES platform.tenant_announcements (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  event_code TEXT NOT NULL,
  summary TEXT NULL,
  actor_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_announcement_events_event_code_check
    CHECK (event_code IN (
      'created', 'updated', 'scheduled', 'published', 'unpublished',
      'expired', 'archived', 'previewed', 'media_attached', 'media_cleared'
    )),
  CONSTRAINT tenant_announcement_events_summary_len
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS tenant_announcement_events_ann_idx
  ON platform.tenant_announcement_events (announcement_id, created_at DESC);

CREATE OR REPLACE FUNCTION platform.prevent_tenant_announcement_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform.tenant_announcement_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS tenant_announcement_events_no_update
  ON platform.tenant_announcement_events;
CREATE TRIGGER tenant_announcement_events_no_update
  BEFORE UPDATE ON platform.tenant_announcement_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_tenant_announcement_events_mutation();

DROP TRIGGER IF EXISTS tenant_announcement_events_no_delete
  ON platform.tenant_announcement_events;
CREATE TRIGGER tenant_announcement_events_no_delete
  BEFORE DELETE ON platform.tenant_announcement_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_tenant_announcement_events_mutation();
