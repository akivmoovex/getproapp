-- Shared product-agnostic website engine.
-- Append-only. Tenant isolation via organization_id on every row.
-- Does not store full rendered HTML pages as source of truth.

CREATE TABLE IF NOT EXISTS platform.website_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'coming_soon',
  scope_kind TEXT NOT NULL DEFAULT 'tenant',
  scope_ref UUID NULL,
  published_at TIMESTAMPTZ NULL,
  last_editor_identity_id UUID NULL,
  last_published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_instances_product_code_format
    CHECK (product_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT website_instances_template_id_format
    CHECK (template_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT website_instances_template_version_range
    CHECK (template_version >= 1 AND template_version <= 9999),
  CONSTRAINT website_instances_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT website_instances_status_check
    CHECK (status IN ('draft', 'coming_soon', 'published', 'archived')),
  CONSTRAINT website_instances_scope_kind_check
    CHECK (scope_kind IN ('tenant', 'church_wide', 'branch', 'clinic'))
);

CREATE UNIQUE INDEX IF NOT EXISTS website_instances_org_product_scope_uidx
  ON platform.website_instances (
    organization_id,
    product_code,
    COALESCE(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status <> 'archived';

CREATE UNIQUE INDEX IF NOT EXISTS website_instances_product_slug_uidx
  ON platform.website_instances (product_code, slug)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS website_instances_org_idx
  ON platform.website_instances (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform.website_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NOT NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  content_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  draft_value JSONB NULL,
  published_value JSONB NULL,
  visibility TEXT NOT NULL DEFAULT 'visible',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by_identity_id UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_content_key_format
    CHECK (content_key ~ '^[a-z][a-z0-9_.]{0,95}$'),
  CONSTRAINT website_content_type_check
    CHECK (content_type IN (
      'short_text', 'long_text', 'rich_text', 'image', 'video_url',
      'url', 'email', 'phone', 'boolean', 'enum', 'structured'
    )),
  CONSTRAINT website_content_visibility_check
    CHECK (visibility IN ('visible', 'hidden')),
  CONSTRAINT website_content_draft_object
    CHECK (draft_value IS NULL OR jsonb_typeof(draft_value) = 'object'),
  CONSTRAINT website_content_published_object
    CHECK (published_value IS NULL OR jsonb_typeof(published_value) = 'object'),
  CONSTRAINT website_content_instance_key_uidx UNIQUE (instance_id, content_key)
);

CREATE INDEX IF NOT EXISTS website_content_org_instance_idx
  ON platform.website_content (organization_id, instance_id);

CREATE TABLE IF NOT EXISTS platform.website_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  uploader_identity_id UUID NULL,
  media_kind TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width_px INTEGER NULL,
  height_px INTEGER NULL,
  alt_text TEXT NULL,
  external_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  sha256 TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_media_kind_check
    CHECK (media_kind IN ('image', 'video_url', 'document')),
  CONSTRAINT website_media_status_check
    CHECK (status IN ('active', 'archived', 'quarantined')),
  CONSTRAINT website_media_filename_len
    CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  CONSTRAINT website_media_storage_key_uidx UNIQUE (storage_key)
);

CREATE INDEX IF NOT EXISTS website_media_org_created_idx
  ON platform.website_media (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.website_media_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  media_id UUID NOT NULL
    REFERENCES platform.website_media (id)
    ON DELETE RESTRICT,
  instance_id UUID NOT NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  content_key TEXT NOT NULL,
  usage_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_media_usages_kind_check
    CHECK (usage_kind IN ('draft', 'published')),
  CONSTRAINT website_media_usages_unique
    UNIQUE (media_id, instance_id, content_key, usage_kind)
);

CREATE TABLE IF NOT EXISTS platform.website_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NOT NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'submitted',
  snapshot_json JSONB NOT NULL,
  changed_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  submitter_identity_id UUID NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewer_identity_id UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  version_id UUID NULL,
  row_version INTEGER NOT NULL DEFAULT 1,
  override_readiness BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT website_submissions_status_check
    CHECK (status IN (
      'submitted', 'approved', 'changes_requested', 'rejected', 'superseded'
    )),
  CONSTRAINT website_submissions_snapshot_object
    CHECK (jsonb_typeof(snapshot_json) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS website_submissions_open_uidx
  ON platform.website_submissions (instance_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS website_submissions_org_status_idx
  ON platform.website_submissions (organization_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS platform.website_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NOT NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  submission_id UUID NULL
    REFERENCES platform.website_submissions (id)
    ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  submitter_identity_id UUID NULL,
  reviewer_identity_id UUID NULL,
  change_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_versions_status_check
    CHECK (status IN ('published', 'superseded')),
  CONSTRAINT website_versions_instance_number_uidx UNIQUE (instance_id, version_number)
);

CREATE TABLE IF NOT EXISTS platform.website_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  actor_identity_id UUID NULL,
  action_key TEXT NOT NULL,
  content_key TEXT NULL,
  submission_id UUID NULL,
  version_id UUID NULL,
  media_id UUID NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_audit_action_format
    CHECK (action_key ~ '^[a-z][a-z0-9_.]{1,95}$'),
  CONSTRAINT website_audit_metadata_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT website_audit_metadata_size
    CHECK (octet_length(metadata_json::text) <= 8000)
);

CREATE INDEX IF NOT EXISTS website_audit_org_created_idx
  ON platform.website_audit_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS website_audit_instance_created_idx
  ON platform.website_audit_events (instance_id, created_at DESC)
  WHERE instance_id IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.prevent_website_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform.website_audit_events is append-only'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS website_audit_events_no_update ON platform.website_audit_events;
CREATE TRIGGER website_audit_events_no_update
  BEFORE UPDATE ON platform.website_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_website_audit_mutation();

DROP TRIGGER IF EXISTS website_audit_events_no_delete ON platform.website_audit_events;
CREATE TRIGGER website_audit_events_no_delete
  BEFORE DELETE ON platform.website_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_website_audit_mutation();

CREATE TABLE IF NOT EXISTS platform.website_checklist_state (
  instance_id UUID PRIMARY KEY
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  percent_complete INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform.website_submissions
  DROP CONSTRAINT IF EXISTS website_submissions_version_fk;
ALTER TABLE platform.website_submissions
  ADD CONSTRAINT website_submissions_version_fk
  FOREIGN KEY (version_id) REFERENCES platform.website_versions (id)
  ON DELETE SET NULL;

COMMENT ON TABLE platform.website_instances IS
  'Tenant website identity for a product template. Content lives in website_content.';
COMMENT ON TABLE platform.website_audit_events IS
  'Append-only website workflow audit. Separate from clinical records.';
