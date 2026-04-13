-- Companies ↔ field-agent account manager + optional source submission (admin linkage only).

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS account_manager_field_agent_id INTEGER REFERENCES public.field_agents (id) ON DELETE SET NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS source_field_agent_submission_id INTEGER REFERENCES public.field_agent_provider_submissions (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_source_fa_submission_unique
  ON public.companies (source_field_agent_submission_id)
  WHERE source_field_agent_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_account_manager_fa
  ON public.companies (tenant_id, account_manager_field_agent_id)
  WHERE account_manager_field_agent_id IS NOT NULL;

COMMIT;
