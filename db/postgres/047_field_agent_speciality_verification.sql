BEGIN;

ALTER TABLE public.field_agent_submission_website_specialities
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.field_agent_submission_website_specialities
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NULL;

ALTER TABLE public.field_agent_submission_website_specialities
  ADD COLUMN IF NOT EXISTS verified_by_admin_user_id INTEGER NULL;

COMMIT;
