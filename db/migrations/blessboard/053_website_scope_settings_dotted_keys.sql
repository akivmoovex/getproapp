-- Stage 2 (Prompt 7): allow dotted field-level setting keys on website_scope_settings.
-- Additive only. Does not invent override rows or copy church values.

ALTER TABLE blessboard.website_scope_settings
  DROP CONSTRAINT IF EXISTS wss_setting_key_format;

ALTER TABLE blessboard.website_scope_settings
  ADD CONSTRAINT wss_setting_key_format
  CHECK (setting_key ~ '^[a-z][a-z0-9_.]{0,95}$');

COMMENT ON CONSTRAINT wss_setting_key_format ON blessboard.website_scope_settings IS
  'Stage 2 dotted keys (e.g. contact.phone, seo.title) plus Stage 1 coarse keys.';
