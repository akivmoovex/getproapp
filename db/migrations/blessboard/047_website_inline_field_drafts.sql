-- Phase 7 Stage 4: field-level website drafts for inline editing.
-- Published public_pages/page_sections remain public source of truth until drafts are applied.

CREATE TABLE IF NOT EXISTS blessboard.website_inline_field_drafts (
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
  page_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  previous_value TEXT NULL,
  new_value TEXT NOT NULL,
  editor_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wifd_page_key_format
    CHECK (page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wifd_section_key_format
    CHECK (section_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wifd_field_key_format
    CHECK (field_key ~ '^[a-z][a-zA-Z0-9_]{0,63}$'),
  CONSTRAINT wifd_previous_value_len
    CHECK (previous_value IS NULL OR char_length(previous_value) <= 8000),
  CONSTRAINT wifd_new_value_len
    CHECK (char_length(new_value) BETWEEN 0 AND 8000),
  CONSTRAINT wifd_status_check
    CHECK (status IN ('draft', 'applied', 'discarded'))
);

-- One active draft per field scope (NULL branch = HQ site).
CREATE UNIQUE INDEX IF NOT EXISTS wifd_active_draft_unique
  ON blessboard.website_inline_field_drafts (
    church_id,
    page_key,
    section_key,
    field_key,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS wifd_church_draft_idx
  ON blessboard.website_inline_field_drafts (church_id, page_key)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS wifd_org_draft_idx
  ON blessboard.website_inline_field_drafts (organization_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS wifd_editor_idx
  ON blessboard.website_inline_field_drafts (editor_user_id, updated_at DESC);
