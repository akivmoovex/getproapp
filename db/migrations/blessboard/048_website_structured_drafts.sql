-- Phase 7 Stage 5: structured website drafts (media + collections).
-- Scalar text drafts remain in website_inline_field_drafts (Stage 4).

CREATE TABLE IF NOT EXISTS blessboard.website_structured_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE CASCADE,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE CASCADE,
  draft_kind TEXT NOT NULL,
  page_key TEXT NULL,
  section_key TEXT NULL,
  entity_key TEXT NOT NULL,
  op TEXT NOT NULL DEFAULT 'upsert',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_payload JSONB NULL,
  editor_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wsd_kind_check
    CHECK (draft_kind IN (
      'image', 'video', 'service_times',
      'leader', 'ministry', 'event', 'sermon'
    )),
  CONSTRAINT wsd_op_check
    CHECK (op IN ('upsert', 'remove', 'reorder')),
  CONSTRAINT wsd_status_check
    CHECK (status IN ('draft', 'applied', 'discarded')),
  CONSTRAINT wsd_entity_key_format
    CHECK (char_length(btrim(entity_key)) BETWEEN 1 AND 120),
  CONSTRAINT wsd_page_key_format
    CHECK (page_key IS NULL OR page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wsd_section_key_format
    CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wsd_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS wsd_active_draft_unique
  ON blessboard.website_structured_drafts (
    church_id,
    draft_kind,
    COALESCE(page_key, ''),
    COALESCE(section_key, ''),
    entity_key,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS wsd_church_draft_idx
  ON blessboard.website_structured_drafts (church_id, draft_kind)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS wsd_org_draft_idx
  ON blessboard.website_structured_drafts (organization_id)
  WHERE status = 'draft';
