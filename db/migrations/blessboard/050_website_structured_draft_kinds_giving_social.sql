-- Phase 7: allow giving_method and social_link structured draft kinds.
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
    'social_link'
  ));
