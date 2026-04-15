-- Manual bank reconciliation flags (read/compare UI + mark reconciled). Does not alter payment ledger rows.

BEGIN;

ALTER TABLE public.field_agent_payout_batches
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

COMMIT;
