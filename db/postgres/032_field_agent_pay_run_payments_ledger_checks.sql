-- Ledger invariants: amount sign and required metadata keys by metadata->>'type'.
-- (A) amount <> 0 is already enforced by field_agent_pay_run_payments_amount_nonzero (030).
-- This migration adds CHECKs for type-specific rules (B–F).

BEGIN;

-- Full row validity (must match the CHECK constraints below). Used only to fail fast with a clear error.
DO $precheck$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.field_agent_pay_run_payments
    WHERE NOT (
      -- (A) nonzero — also enforced by field_agent_pay_run_payments_amount_nonzero
      amount <> 0
      -- (B) type = payment  => amount > 0
      AND ((metadata->>'type' IS DISTINCT FROM 'payment') OR (amount > 0))
      -- (C) type = correction_payment => amount > 0
      AND ((metadata->>'type' IS DISTINCT FROM 'correction_payment') OR (amount > 0))
      -- (D) type = reversal => amount < 0
      AND ((metadata->>'type' IS DISTINCT FROM 'reversal') OR (amount < 0))
      -- (E) type = reversal => reason + reverses_payment_id
      AND (
        (metadata->>'type' IS DISTINCT FROM 'reversal')
        OR ((metadata ? 'reason') AND (metadata ? 'reverses_payment_id'))
      )
      -- (F) type = correction_payment => reason + corrects_payment_id + replaced_amount
      AND (
        (metadata->>'type' IS DISTINCT FROM 'correction_payment')
        OR (
          (metadata ? 'reason')
          AND (metadata ? 'corrects_payment_id')
          AND (metadata ? 'replaced_amount')
        )
      )
    )
  ) THEN
    RAISE EXCEPTION
      'field_agent_pay_run_payments (032): one or more ledger rows violate the new CHECK rules. '
      'No schema changes were applied. '
      'Inspect offending rows with: '
      'SELECT id, tenant_id, pay_run_id, amount, metadata '
      'FROM public.field_agent_pay_run_payments '
      'WHERE NOT ( '
      '  amount <> 0 '
      '  AND ((metadata->>''type'' IS DISTINCT FROM ''payment'') OR (amount > 0)) '
      '  AND ((metadata->>''type'' IS DISTINCT FROM ''correction_payment'') OR (amount > 0)) '
      '  AND ((metadata->>''type'' IS DISTINCT FROM ''reversal'') OR (amount < 0)) '
      '  AND ((metadata->>''type'' IS DISTINCT FROM ''reversal'') OR ((metadata ? ''reason'') AND (metadata ? ''reverses_payment_id''))) '
      '  AND ((metadata->>''type'' IS DISTINCT FROM ''correction_payment'') OR ((metadata ? ''reason'') AND (metadata ? ''corrects_payment_id'') AND (metadata ? ''replaced_amount''))) '
      '); '
      'Fix data (examples): align amount sign with metadata->>''type''; add missing JSON keys; '
      'for reversals ensure negative amount and reverses_payment_id + reason; '
      'for correction_payment ensure positive amount and corrects_payment_id, replaced_amount, reason. '
      'Do not delete financial rows unless your policy allows; prefer corrective new ledger lines per product rules.';
  END IF;
END
$precheck$;

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_ledger_chk_type_payment_amount;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_ledger_chk_type_payment_amount
  CHECK (
    (metadata->>'type' IS DISTINCT FROM 'payment')
    OR (amount > 0)
  );

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_ledger_chk_type_correction_amount;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_ledger_chk_type_correction_amount
  CHECK (
    (metadata->>'type' IS DISTINCT FROM 'correction_payment')
    OR (amount > 0)
  );

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_ledger_chk_type_reversal_amount;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_ledger_chk_type_reversal_amount
  CHECK (
    (metadata->>'type' IS DISTINCT FROM 'reversal')
    OR (amount < 0)
  );

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_ledger_chk_reversal_metadata;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_ledger_chk_reversal_metadata
  CHECK (
    (metadata->>'type' IS DISTINCT FROM 'reversal')
    OR ((metadata ? 'reason') AND (metadata ? 'reverses_payment_id'))
  );

ALTER TABLE public.field_agent_pay_run_payments
  DROP CONSTRAINT IF EXISTS field_agent_pay_run_payments_ledger_chk_correction_metadata;

ALTER TABLE public.field_agent_pay_run_payments
  ADD CONSTRAINT field_agent_pay_run_payments_ledger_chk_correction_metadata
  CHECK (
    (metadata->>'type' IS DISTINCT FROM 'correction_payment')
    OR (
      (metadata ? 'reason')
      AND (metadata ? 'corrects_payment_id')
      AND (metadata ? 'replaced_amount')
    )
  );

COMMIT;
