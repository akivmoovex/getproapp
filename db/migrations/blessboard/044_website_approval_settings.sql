-- Phase3 Batch C: website approval settings (additive).
-- Does not rewrite migrations 040–043.

CREATE TABLE IF NOT EXISTS blessboard.website_approval_settings (
  organization_id UUID PRIMARY KEY
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  branch_edit_mode TEXT NOT NULL DEFAULT 'approval_required',
  require_preview_before_publish BOOLEAN NOT NULL DEFAULT true,
  require_mobile_preview_confirmation BOOLEAN NOT NULL DEFAULT false,
  prevent_self_approval BOOLEAN NOT NULL DEFAULT true,
  require_request_changes_comment BOOLEAN NOT NULL DEFAULT true,
  require_rejection_reason BOOLEAN NOT NULL DEFAULT true,
  review_notification_preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_content_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  trusted_branch_publish_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  CONSTRAINT was_branch_edit_mode_check
    CHECK (branch_edit_mode IN (
      'approval_required',
      'trusted_branch_publish',
      'draft_only'
    )),
  CONSTRAINT was_notification_object
    CHECK (jsonb_typeof(review_notification_preferences_json) = 'object'),
  CONSTRAINT was_content_types_array
    CHECK (jsonb_typeof(approval_content_types_json) = 'array'),
  CONSTRAINT was_updated_at_ok
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS was_updated_by_idx
  ON blessboard.website_approval_settings (updated_by)
  WHERE updated_by IS NOT NULL;
