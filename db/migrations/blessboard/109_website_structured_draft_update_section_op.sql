-- V8 Prompt 10: allow page_section update_section structured draft operations.
-- Additive only — extends the op CHECK; does not rewrite existing draft rows.

ALTER TABLE blessboard.website_structured_drafts
  DROP CONSTRAINT IF EXISTS website_structured_drafts_op_check;

ALTER TABLE blessboard.website_structured_drafts
  ADD CONSTRAINT website_structured_drafts_op_check
  CHECK (op IN (
    'upsert',
    'remove',
    'reorder',
    'visibility',
    'restore_default',
    'add_section',
    'update_section'
  ));
