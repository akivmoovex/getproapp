-- Partial unique indexes: at most one reversal row and one correction_payment row
-- per (tenant_id, pay_run_id, original payment id reference) — concurrency-safe with app checks.

BEGIN;

-- Fail fast if existing data would violate the new rules (no deletes/updates of financial rows).
DO $precheck$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT tenant_id, pay_run_id, metadata->>'reverses_payment_id' AS link_id, COUNT(*)::bigint AS n
      FROM public.field_agent_pay_run_payments
      WHERE (metadata->>'type') = 'reversal'
        AND (metadata->>'reverses_payment_id') IS NOT NULL
        AND btrim(metadata->>'reverses_payment_id') <> ''
      GROUP BY tenant_id, pay_run_id, metadata->>'reverses_payment_id'
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'field_agent_pay_run_payments (031): duplicate reversal rows exist for the same (tenant_id, pay_run_id, reverses_payment_id). Resolve manually before applying this migration. No schema changes were applied.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT tenant_id, pay_run_id, metadata->>'corrects_payment_id' AS link_id, COUNT(*)::bigint AS n
      FROM public.field_agent_pay_run_payments
      WHERE (metadata->>'type') = 'correction_payment'
        AND (metadata->>'corrects_payment_id') IS NOT NULL
        AND btrim(metadata->>'corrects_payment_id') <> ''
      GROUP BY tenant_id, pay_run_id, metadata->>'corrects_payment_id'
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'field_agent_pay_run_payments (031): duplicate correction_payment rows exist for the same (tenant_id, pay_run_id, corrects_payment_id). Resolve manually before applying this migration. No schema changes were applied.';
  END IF;
END
$precheck$;

-- Constraint names = index names (PostgreSQL reports the index name on unique_violation for these indexes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fapr_reversal_per_original_payment
  ON public.field_agent_pay_run_payments (
    tenant_id,
    pay_run_id,
    (metadata->>'reverses_payment_id')
  )
  WHERE (metadata->>'type') = 'reversal'
    AND (metadata->>'reverses_payment_id') IS NOT NULL
    AND btrim(metadata->>'reverses_payment_id') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fapr_correction_per_original_payment
  ON public.field_agent_pay_run_payments (
    tenant_id,
    pay_run_id,
    (metadata->>'corrects_payment_id')
  )
  WHERE (metadata->>'type') = 'correction_payment'
    AND (metadata->>'corrects_payment_id') IS NOT NULL
    AND btrim(metadata->>'corrects_payment_id') <> '';

COMMIT;
