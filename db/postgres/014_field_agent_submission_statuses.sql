-- Extend field_agent_provider_submissions.status: info_needed, appealed.
-- Refresh partial unique indexes so "open pipeline" matches application OPEN_PIPELINE_STATUSES.

BEGIN;

DROP INDEX IF EXISTS public.idx_fa_sub_tenant_phone_unique;
DROP INDEX IF EXISTS public.idx_fa_sub_tenant_wa_unique;

ALTER TABLE public.field_agent_provider_submissions
  DROP CONSTRAINT IF EXISTS field_agent_provider_submissions_status_check;

ALTER TABLE public.field_agent_provider_submissions
  ADD CONSTRAINT field_agent_provider_submissions_status_check
  CHECK (status IN ('pending', 'info_needed', 'approved', 'rejected', 'appealed'));

CREATE UNIQUE INDEX idx_fa_sub_tenant_phone_unique
  ON public.field_agent_provider_submissions (tenant_id, phone_norm)
  WHERE phone_norm <> '' AND status IN ('pending', 'info_needed', 'approved', 'appealed');

CREATE UNIQUE INDEX idx_fa_sub_tenant_wa_unique
  ON public.field_agent_provider_submissions (tenant_id, whatsapp_norm)
  WHERE whatsapp_norm <> '' AND status IN ('pending', 'info_needed', 'approved', 'appealed');

COMMIT;
