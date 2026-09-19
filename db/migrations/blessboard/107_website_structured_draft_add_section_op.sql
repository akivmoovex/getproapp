-- BUG-007: allow page_section add_section structured draft operations.
ALTER TABLE blessboard.website_structured_drafts
  DROP CONSTRAINT IF EXISTS wsd_op_check;

ALTER TABLE blessboard.website_structured_drafts
  ADD CONSTRAINT wsd_op_check
  CHECK (op IN ('upsert', 'remove', 'reorder', 'visibility', 'restore_default', 'add_section'));
