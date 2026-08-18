-- Shared website lifecycle, publishing policy, version provenance, and
-- append-only moderation events. Does not change organization/identity status.
-- Does not overwrite website_content or BlessBoard public_pages.

ALTER TABLE platform.website_instances
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS publish_policy TEXT NOT NULL DEFAULT 'REVIEW_BEFORE_PUBLISH',
  ADD COLUMN IF NOT EXISTS adapter_mode TEXT NOT NULL DEFAULT 'shared_engine',
  ADD COLUMN IF NOT EXISTS lifecycle_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_note_public TEXT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_note_internal TEXT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS previous_lifecycle_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS edit_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_lifecycle_status_check;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_lifecycle_status_check
  CHECK (lifecycle_status IN (
    'provisional', 'public', 'under_review', 'suspended', 'offline'
  ));

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_publish_policy_check;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_publish_policy_check
  CHECK (publish_policy IN (
    'AUTO_PUBLISH_WITH_MODERATION',
    'REVIEW_BEFORE_PUBLISH',
    'PLATFORM_LOCKED'
  ));

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_adapter_mode_check;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_adapter_mode_check
  CHECK (adapter_mode IN ('shared_engine', 'legacy_cms'));

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_lifecycle_reason_len;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_lifecycle_reason_len
  CHECK (lifecycle_reason IS NULL OR char_length(lifecycle_reason) BETWEEN 1 AND 500);

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_lifecycle_note_public_len;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_lifecycle_note_public_len
  CHECK (lifecycle_note_public IS NULL OR char_length(lifecycle_note_public) BETWEEN 1 AND 2000);

ALTER TABLE platform.website_instances
  DROP CONSTRAINT IF EXISTS website_instances_lifecycle_note_internal_len;
ALTER TABLE platform.website_instances
  ADD CONSTRAINT website_instances_lifecycle_note_internal_len
  CHECK (lifecycle_note_internal IS NULL OR char_length(lifecycle_note_internal) BETWEEN 1 AND 2000);

CREATE INDEX IF NOT EXISTS website_instances_lifecycle_idx
  ON platform.website_instances (product_code, lifecycle_status, updated_at DESC)
  WHERE status <> 'archived';

-- Existing ActiveClinic public sites stay public + review-before-publish.
-- Guard: platform migrations may run before the ActiveClinic schema exists.
DO $$
BEGIN
  IF to_regclass('activeclinic.healthcare_organizations') IS NOT NULL THEN
    UPDATE platform.website_instances i
       SET lifecycle_status = 'public',
           publish_policy = 'REVIEW_BEFORE_PUBLISH',
           adapter_mode = 'shared_engine'
      FROM activeclinic.healthcare_organizations h
     WHERE i.product_code = 'activeclinic'
       AND h.organization_id = i.organization_id
       AND h.website_published IS TRUE
       AND i.lifecycle_status = 'provisional';
  END IF;
END $$;

-- BlessBoard shared-engine shells remain legacy CMS adapters (public_pages SoT).
UPDATE platform.website_instances
   SET adapter_mode = 'legacy_cms',
       publish_policy = 'REVIEW_BEFORE_PUBLISH',
       lifecycle_status = CASE
         WHEN status = 'published' THEN 'public'
         ELSE lifecycle_status
       END
 WHERE product_code = 'blessboard';

ALTER TABLE platform.website_versions
  ADD COLUMN IF NOT EXISTS source_policy TEXT NULL,
  ADD COLUMN IF NOT EXISTS previous_version_id UUID NULL
    REFERENCES platform.website_versions (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS changed_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS editor_identity_id UUID NULL;

ALTER TABLE platform.website_versions
  DROP CONSTRAINT IF EXISTS website_versions_source_policy_check;
ALTER TABLE platform.website_versions
  ADD CONSTRAINT website_versions_source_policy_check
  CHECK (
    source_policy IS NULL
    OR source_policy IN (
      'AUTO_PUBLISH_WITH_MODERATION',
      'REVIEW_BEFORE_PUBLISH',
      'PLATFORM_LOCKED',
      'RESTORE'
    )
  );

ALTER TABLE platform.website_versions
  DROP CONSTRAINT IF EXISTS website_versions_moderation_status_check;
ALTER TABLE platform.website_versions
  ADD CONSTRAINT website_versions_moderation_status_check
  CHECK (moderation_status IN (
    'published', 'restored', 'flagged', 'under_review'
  ));

CREATE TABLE IF NOT EXISTS platform.website_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  actor_identity_id UUID NULL,
  action_key TEXT NOT NULL,
  reason TEXT NULL,
  notes TEXT NULL,
  notes_tenant_visible BOOLEAN NOT NULL DEFAULT false,
  previous_state TEXT NULL,
  new_state TEXT NULL,
  target_version_id UUID NULL
    REFERENCES platform.website_versions (id)
    ON DELETE RESTRICT,
  submission_id UUID NULL
    REFERENCES platform.website_submissions (id)
    ON DELETE RESTRICT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_moderation_action_format
    CHECK (action_key ~ '^[a-z][a-z0-9_.]{1,95}$'),
  CONSTRAINT website_moderation_product_format
    CHECK (product_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT website_moderation_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT website_moderation_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 4000),
  CONSTRAINT website_moderation_metadata_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT website_moderation_metadata_size
    CHECK (octet_length(metadata_json::text) <= 8000)
);

CREATE INDEX IF NOT EXISTS website_moderation_events_created_idx
  ON platform.website_moderation_events (created_at DESC);

CREATE INDEX IF NOT EXISTS website_moderation_events_org_idx
  ON platform.website_moderation_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS website_moderation_events_product_idx
  ON platform.website_moderation_events (product_code, created_at DESC);

CREATE OR REPLACE FUNCTION platform.prevent_website_moderation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform.website_moderation_events is append-only'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS website_moderation_events_no_update ON platform.website_moderation_events;
CREATE TRIGGER website_moderation_events_no_update
  BEFORE UPDATE ON platform.website_moderation_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_website_moderation_mutation();

DROP TRIGGER IF EXISTS website_moderation_events_no_delete ON platform.website_moderation_events;
CREATE TRIGGER website_moderation_events_no_delete
  BEFORE DELETE ON platform.website_moderation_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_website_moderation_mutation();

COMMENT ON COLUMN platform.website_instances.lifecycle_status IS
  'Public website lifecycle; orthogonal to organization and account status.';
COMMENT ON COLUMN platform.website_instances.publish_policy IS
  'How tenant edits become live. Platform Admin may override per tenant.';
COMMENT ON TABLE platform.website_moderation_events IS
  'Append-only website moderation actions. Never disable tenant accounts.';
