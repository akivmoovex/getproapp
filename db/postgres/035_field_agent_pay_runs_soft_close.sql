-- Soft-close marker for workflow tracking (informational only; no enforcement in application layer this phase).

BEGIN;

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fapr_pay_runs_tenant_closed
  ON public.field_agent_pay_runs (tenant_id, closed_at DESC NULLS LAST)
  WHERE closed_at IS NOT NULL;

COMMIT;
