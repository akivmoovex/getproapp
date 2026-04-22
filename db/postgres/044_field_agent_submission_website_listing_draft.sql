-- Approved submission: structured mini-site / directory listing text draft (field-agent console only).
-- Does not change submission moderation status (pending | info_needed | approved | rejected | appealed).

BEGIN;

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS website_listing_draft_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS website_listing_review_requested_at TIMESTAMPTZ NULL;

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS website_listing_review_status TEXT NOT NULL DEFAULT '';

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS website_listing_review_comment TEXT NOT NULL DEFAULT '';

COMMIT;
