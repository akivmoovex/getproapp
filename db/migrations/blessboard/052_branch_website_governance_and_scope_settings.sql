-- Stage 1 (Prompt 7): branch website governance + field-level scope settings foundation.
-- Additive only. Does not copy church-wide CMS into branches.
-- Does not rewrite public_pages / leaders / ministries / events / sermons / giving_methods.

-- ---------------------------------------------------------------------------
-- Org-level master policies (extend website_approval_settings)
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.website_approval_settings
  ADD COLUMN IF NOT EXISTS allow_branch_giving_methods BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE blessboard.website_approval_settings
  ADD COLUMN IF NOT EXISTS allow_branch_urgent_updates BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN blessboard.website_approval_settings.allow_branch_giving_methods IS
  'HQ master switch: when false, no branch may publish local giving methods.';
COMMENT ON COLUMN blessboard.website_approval_settings.allow_branch_urgent_updates IS
  'HQ master switch: when false, expedited contact/service-time path is unavailable.';

-- ---------------------------------------------------------------------------
-- Per-branch website governance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.branch_website_governance (
  branch_id UUID PRIMARY KEY
    REFERENCES blessboard.branches (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE CASCADE,
  allow_local_giving_methods BOOLEAN NOT NULL DEFAULT false,
  branch_publish_mode TEXT NOT NULL DEFAULT 'hq_approval',
  allow_urgent_contact_updates BOOLEAN NOT NULL DEFAULT false,
  allow_hide_optional_pages BOOLEAN NOT NULL DEFAULT false,
  hideable_page_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_accent_treatment BOOLEAN NOT NULL DEFAULT false,
  collection_policies_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_setting_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  CONSTRAINT bwg_branch_publish_mode_check
    CHECK (branch_publish_mode IN ('hq_approval', 'trusted_direct')),
  CONSTRAINT bwg_hideable_pages_array
    CHECK (jsonb_typeof(hideable_page_keys_json) = 'array'),
  CONSTRAINT bwg_collection_policies_object
    CHECK (jsonb_typeof(collection_policies_json) = 'object'),
  CONSTRAINT bwg_locked_keys_array
    CHECK (jsonb_typeof(locked_setting_keys_json) = 'array'),
  CONSTRAINT bwg_updated_at_ok
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS bwg_organization_idx
  ON blessboard.branch_website_governance (organization_id);

CREATE INDEX IF NOT EXISTS bwg_church_idx
  ON blessboard.branch_website_governance (church_id);

COMMENT ON TABLE blessboard.branch_website_governance IS
  'Per-branch website permissions and locks. Defaults are restrictive; HQ enables features explicitly.';

-- Backfill one governance row per existing branch (safe defaults; preserve content).
INSERT INTO blessboard.branch_website_governance (
  branch_id,
  organization_id,
  church_id,
  allow_local_giving_methods,
  branch_publish_mode,
  allow_urgent_contact_updates,
  allow_hide_optional_pages,
  hideable_page_keys_json,
  allow_accent_treatment,
  collection_policies_json,
  locked_setting_keys_json
)
SELECT
  b.id,
  c.organization_id,
  b.church_id,
  false,
  'hq_approval',
  false,
  false,
  '[]'::jsonb,
  false,
  '{}'::jsonb,
  '[]'::jsonb
FROM blessboard.branches b
INNER JOIN blessboard.churches c ON c.id = b.church_id
ON CONFLICT (branch_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Field-level branch scope settings (override / hidden foundation)
-- ---------------------------------------------------------------------------
-- Absence of a row (or is_active = false) means inherit church default.
-- Do not store copied church values solely to represent inherit.

CREATE TABLE IF NOT EXISTS blessboard.website_scope_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE CASCADE,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  inheritance_state TEXT NOT NULL DEFAULT 'override',
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_value_json JSONB NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  CONSTRAINT wss_setting_key_format
    CHECK (setting_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT wss_inheritance_state_check
    CHECK (inheritance_state IN ('override', 'hidden')),
  CONSTRAINT wss_value_object
    CHECK (jsonb_typeof(value_json) = 'object'),
  CONSTRAINT wss_previous_object_or_null
    CHECK (previous_value_json IS NULL OR jsonb_typeof(previous_value_json) = 'object'),
  CONSTRAINT wss_updated_at_ok
    CHECK (updated_at >= created_at)
);

-- One active override/hidden row per branch setting key.
CREATE UNIQUE INDEX IF NOT EXISTS wss_active_branch_setting_unique
  ON blessboard.website_scope_settings (church_id, branch_id, setting_key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS wss_organization_idx
  ON blessboard.website_scope_settings (organization_id);

CREATE INDEX IF NOT EXISTS wss_branch_idx
  ON blessboard.website_scope_settings (branch_id)
  WHERE is_active = true;

COMMENT ON TABLE blessboard.website_scope_settings IS
  'Branch field-level website overrides. No row = inherit. Reset deactivates the row.';

-- Empty backfill by design: existing branches inherit until an override is written.
