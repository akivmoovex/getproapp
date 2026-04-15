-- Append-only ledger: allow negative amounts for reversals; metadata for audit links.

BEGIN;

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_amount_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'field_agent_pay_run_payments_amount_nonzero'
      AND t.relname = 'field_agent_pay_run_payments'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.field_agent_pay_run_payments
      ADD CONSTRAINT field_agent_pay_run_payments_amount_nonzero
      CHECK (amount <> 0);
  END IF;
END $$;

ALTER TABLE public.field_agent_pay_run_payments
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
