-- V7 Phase 3: allow page_section structured drafts so classic section ordering
-- has a draft representation instead of mutating live sort_order.
ALTER TABLE blessboard.website_structured_drafts
  DROP CONSTRAINT IF EXISTS wsd_kind_check;

ALTER TABLE blessboard.website_structured_drafts
  ADD CONSTRAINT wsd_kind_check
  CHECK (draft_kind IN (
    'image',
    'video',
    'service_times',
    'leader',
    'ministry',
    'event',
    'sermon',
    'giving_method',
    'social_link',
    'page_section'
  ));
