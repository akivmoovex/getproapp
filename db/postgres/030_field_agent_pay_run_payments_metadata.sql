-- Append-only ledger: allow negative amounts for reversals; metadata for audit links.

BEGIN;

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_amount_check;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_amount_nonzero CHECK (amount <> 0);

ALTER TABLE public.field_agent_pay_run_payments
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
