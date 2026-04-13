-- Lock / approve workflow: audit columns, constraints, immutability triggers.
-- Idempotent: safe to re-run after 020_field_agent_pay_runs.sql.

BEGIN;

ALTER TABLE public.field_agent_pay_runs
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_admin_user_id INTEGER REFERENCES public.admin_users (id) ON DELETE SET NULL;

-- Tighten status check: drop legacy void if present and re-add with same values for compatibility.
ALTER TABLE public.field_agent_pay_runs DROP CONSTRAINT IF EXISTS field_agent_pay_runs_status_check;
ALTER TABLE public.field_agent_pay_runs
  ADD CONSTRAINT field_agent_pay_runs_status_check
  CHECK (status IN ('draft', 'locked', 'approved', 'paid', 'void'));

ALTER TABLE public.field_agent_pay_runs DROP CONSTRAINT IF EXISTS field_agent_pay_runs_locked_at_rule;
ALTER TABLE public.field_agent_pay_runs
  ADD CONSTRAINT field_agent_pay_runs_locked_at_rule
  CHECK (status NOT IN ('locked', 'approved', 'paid') OR locked_at IS NOT NULL);

ALTER TABLE public.field_agent_pay_runs DROP CONSTRAINT IF EXISTS field_agent_pay_runs_approved_at_rule;
ALTER TABLE public.field_agent_pay_runs
  ADD CONSTRAINT field_agent_pay_runs_approved_at_rule
  CHECK (status NOT IN ('approved', 'paid') OR approved_at IS NOT NULL);

CREATE OR REPLACE FUNCTION public.field_agent_pay_run_items_enforce_draft_parent()
RETURNS TRIGGER AS $$
DECLARE st TEXT;
BEGIN
  SELECT pr.status INTO st FROM public.field_agent_pay_runs pr WHERE pr.id = COALESCE(NEW.pay_run_id, OLD.pay_run_id);
  IF st IS NULL THEN
    RAISE EXCEPTION 'field_agent_pay_run_items: pay run not found';
  END IF;
  IF TG_OP = 'INSERT' AND st <> 'draft' THEN
    RAISE EXCEPTION 'field_agent_pay_run_items: inserts only allowed while pay run is draft';
  END IF;
  IF TG_OP = 'UPDATE' AND st <> 'draft' THEN
    RAISE EXCEPTION 'field_agent_pay_run_items: updates not allowed after lock';
  END IF;
  IF TG_OP = 'DELETE' AND st <> 'draft' THEN
    RAISE EXCEPTION 'field_agent_pay_run_items: deletes not allowed after lock';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_agent_pay_run_items_draft_only ON public.field_agent_pay_run_items;
CREATE TRIGGER trg_field_agent_pay_run_items_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.field_agent_pay_run_items
  FOR EACH ROW EXECUTE PROCEDURE public.field_agent_pay_run_items_enforce_draft_parent();

CREATE OR REPLACE FUNCTION public.field_agent_pay_runs_enforce_immutable_after_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status NOT IN ('draft') THEN
    IF NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'field_agent_pay_runs: period and notes are immutable after draft';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_agent_pay_runs_immutable_fields ON public.field_agent_pay_runs;
CREATE TRIGGER trg_field_agent_pay_runs_immutable_fields
  BEFORE UPDATE ON public.field_agent_pay_runs
  FOR EACH ROW EXECUTE PROCEDURE public.field_agent_pay_runs_enforce_immutable_after_lock();

CREATE OR REPLACE FUNCTION public.field_agent_pay_runs_delete_draft_only()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'field_agent_pay_runs: delete only allowed for draft runs';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_agent_pay_runs_delete_draft ON public.field_agent_pay_runs;
CREATE TRIGGER trg_field_agent_pay_runs_delete_draft
  BEFORE DELETE ON public.field_agent_pay_runs
  FOR EACH ROW EXECUTE PROCEDURE public.field_agent_pay_runs_delete_draft_only();

COMMIT;
