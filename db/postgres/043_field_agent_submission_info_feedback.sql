-- Provider submissions: admin "info needed" message + field-agent reply (latest each).
-- Apply after field_agent_provider_submissions exists. Idempotent.

BEGIN;

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS admin_info_request TEXT NOT NULL DEFAULT '';

ALTER TABLE public.field_agent_provider_submissions
  ADD COLUMN IF NOT EXISTS field_agent_reply TEXT NOT NULL DEFAULT '';

COMMIT;
