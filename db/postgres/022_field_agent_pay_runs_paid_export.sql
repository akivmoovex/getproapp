-- Paid + export metadata; immutability once status = paid.
-- Idempotent: safe to re-run after 021_field_agent_pay_runs_lock_approve.sql.

BEGIN;

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS payout_notes TEXT,
  ADD COLUMN IF NOT EXISTS export_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_format TEXT;

ALTER TABLE public.field_agent_pay_runs DROP CONSTRAINT IF EXISTS field_agent_pay_runs_paid_at_rule;
ALTER TABLE public.field_agent_pay_runs
  ADD CONSTRAINT field_agent_pay_runs_paid_at_rule
  CHECK (status <> 'paid' OR paid_at IS NOT NULL);

-- After paid: no changes except export metadata (repeated CSV download) and updated_at.
CREATE OR REPLACE FUNCTION public.field_agent_pay_runs_enforce_immutable_after_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.created_by_admin_user_id IS DISTINCT FROM OLD.created_by_admin_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_by_admin_user_id IS DISTINCT FROM OLD.locked_by_admin_user_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_admin_user_id IS DISTINCT FROM OLD.approved_by_admin_user_id
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.paid_by_admin_user_id IS DISTINCT FROM OLD.paid_by_admin_user_id
       OR NEW.payout_reference IS DISTINCT FROM OLD.payout_reference
       OR NEW.payout_notes IS DISTINCT FROM OLD.payout_notes
    THEN
      RAISE EXCEPTION 'field_agent_pay_runs: paid runs cannot be modified (except export metadata)';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('draft') THEN
    IF NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'field_agent_pay_runs: period and notes are immutable after draft';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
