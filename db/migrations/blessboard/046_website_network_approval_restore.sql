-- Phase4 Stages 4–5: network approval restore rule (additive).
-- Extends 044 website_approval_settings without rewriting prior migrations.

ALTER TABLE blessboard.website_approval_settings
  ADD COLUMN IF NOT EXISTS require_restore_approval BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE blessboard.website_approval_settings
  ADD COLUMN IF NOT EXISTS hq_direct_publish_enabled BOOLEAN NOT NULL DEFAULT true;
