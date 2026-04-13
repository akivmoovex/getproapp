-- Frozen carry-forward totals per pay-run line (additive; original SP/EC/recruitment columns unchanged).

BEGIN;

ALTER TABLE public.field_agent_pay_run_items
  ADD COLUMN IF NOT EXISTS applied_adjustment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_adjustment_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_summary_label TEXT;

UPDATE public.field_agent_pay_run_items
SET net_payable_amount = (
  COALESCE(sp_payable_amount, 0)::numeric
  + COALESCE(ec_payable_amount, 0)::numeric
  + COALESCE(recruitment_commission_amount, 0)::numeric
),
    applied_adjustment_amount = 0,
    applied_adjustment_count = 0,
    adjustment_summary_label = NULL;

COMMIT;
