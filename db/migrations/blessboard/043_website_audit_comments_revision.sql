-- Phase3 Batch B: website audit events + submission comment visibility.
-- Additive only; does not rewrite migrations 040–042.

CREATE TABLE IF NOT EXISTS blessboard.website_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  actor_role TEXT NULL,
  action_type TEXT NOT NULL,
  page_key TEXT NULL,
  section_key TEXT NULL,
  entity_type TEXT NULL,
  entity_id UUID NULL,
  result TEXT NOT NULL DEFAULT 'success',
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wae_action_type_len
    CHECK (char_length(btrim(action_type)) BETWEEN 1 AND 80),
  CONSTRAINT wae_actor_role_len
    CHECK (actor_role IS NULL OR char_length(btrim(actor_role)) BETWEEN 1 AND 64),
  CONSTRAINT wae_page_key_format
    CHECK (page_key IS NULL OR page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wae_section_key_format
    CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wae_entity_type_len
    CHECK (entity_type IS NULL OR char_length(btrim(entity_type)) BETWEEN 1 AND 64),
  CONSTRAINT wae_result_check
    CHECK (result IN ('success', 'failure', 'denied', 'conflict')),
  CONSTRAINT wae_before_object
    CHECK (jsonb_typeof(before_json) = 'object'),
  CONSTRAINT wae_after_object
    CHECK (jsonb_typeof(after_json) = 'object'),
  CONSTRAINT wae_metadata_object
    CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS wae_org_created_idx
  ON blessboard.website_audit_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wae_org_action_idx
  ON blessboard.website_audit_events (organization_id, action_type);

CREATE INDEX IF NOT EXISTS wae_org_actor_idx
  ON blessboard.website_audit_events (organization_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wae_org_branch_idx
  ON blessboard.website_audit_events (organization_id, branch_id)
  WHERE branch_id IS NOT NULL;

-- Submission conversation: comments + visibility scoping.
ALTER TABLE blessboard.website_change_submission_events
  DROP CONSTRAINT IF EXISTS wcs_events_type_check;

ALTER TABLE blessboard.website_change_submission_events
  ADD CONSTRAINT wcs_events_type_check
  CHECK (event_type IN (
    'created',
    'submitted',
    'reviewed',
    'changes_requested',
    'resubmitted',
    'approved',
    'rejected',
    'published',
    'withdrawn',
    'comment'
  ));

ALTER TABLE blessboard.website_change_submission_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE blessboard.website_change_submission_events
  DROP CONSTRAINT IF EXISTS wcs_events_visibility_check;

ALTER TABLE blessboard.website_change_submission_events
  ADD CONSTRAINT wcs_events_visibility_check
  CHECK (visibility IN ('shared', 'hq_internal'));

ALTER TABLE blessboard.website_change_submission_events
  ADD COLUMN IF NOT EXISTS page_key TEXT NULL;

ALTER TABLE blessboard.website_change_submission_events
  ADD COLUMN IF NOT EXISTS section_key TEXT NULL;

ALTER TABLE blessboard.website_change_submission_events
  DROP CONSTRAINT IF EXISTS wcs_events_page_key_format;

ALTER TABLE blessboard.website_change_submission_events
  ADD CONSTRAINT wcs_events_page_key_format
  CHECK (page_key IS NULL OR page_key ~ '^[a-z][a-z0-9_-]{0,63}$');

ALTER TABLE blessboard.website_change_submission_events
  DROP CONSTRAINT IF EXISTS wcs_events_section_key_format;

ALTER TABLE blessboard.website_change_submission_events
  ADD CONSTRAINT wcs_events_section_key_format
  CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_-]{0,63}$');

-- Lightweight revision token for optimistic concurrency (alongside updated_at).
ALTER TABLE blessboard.page_sections
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE blessboard.page_sections
  DROP CONSTRAINT IF EXISTS page_sections_revision_positive;

ALTER TABLE blessboard.page_sections
  ADD CONSTRAINT page_sections_revision_positive
  CHECK (revision_number >= 1);

ALTER TABLE blessboard.public_pages
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE blessboard.public_pages
  DROP CONSTRAINT IF EXISTS public_pages_revision_positive;

ALTER TABLE blessboard.public_pages
  ADD CONSTRAINT public_pages_revision_positive
  CHECK (revision_number >= 1);
