-- Explicit finance approval before recording payout ledger / marking paid (workflow "approved" is separate).

BEGIN;

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS payout_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_approved_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_approval_note TEXT;

CREATE INDEX IF NOT EXISTS idx_field_agent_pay_runs_tenant_payout_approved
  ON public.field_agent_pay_runs (tenant_id, payout_approved_at DESC NULLS LAST)
  WHERE payout_approved_at IS NOT NULL;

-- Existing approved/paid runs pre-date this gate; treat them as payout-cleared so ledger flows keep working.
UPDATE public.field_agent_pay_runs
SET
  payout_approved_at = COALESCE(approved_at, locked_at, created_at),
  payout_approved_by_admin_user_id = COALESCE(approved_by_admin_user_id, locked_by_admin_user_id, created_by_admin_user_id)
WHERE payout_approved_at IS NULL
  AND status IN ('approved', 'paid');

COMMIT;
