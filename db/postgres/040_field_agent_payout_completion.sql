-- Manual payout completion evidence (bank reference, method, note). Does not mutate ledger rows.

BEGIN;

ALTER TABLE public.field_agent_payout_batches
  ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS completion_note TEXT;

ALTER TABLE public.field_agent_payout_batches DROP CONSTRAINT IF EXISTS field_agent_payout_batches_completion_bank_ref_ck;
ALTER TABLE public.field_agent_payout_batches
  ADD CONSTRAINT field_agent_payout_batches_completion_bank_ref_ck
  CHECK (
    payout_completed_at IS NULL
    OR (bank_reference IS NOT NULL AND length(trim(bank_reference)) > 0)
  );

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS completion_note TEXT;

ALTER TABLE public.field_agent_pay_runs DROP CONSTRAINT IF EXISTS field_agent_pay_runs_payout_completion_bank_ref_ck;
ALTER TABLE public.field_agent_pay_runs
  ADD CONSTRAINT field_agent_pay_runs_payout_completion_bank_ref_ck
  CHECK (
    payout_completed_at IS NULL
    OR (bank_reference IS NOT NULL AND length(trim(bank_reference)) > 0)
  );

COMMIT;
