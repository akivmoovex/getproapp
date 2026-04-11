-- Track whether deal acceptance fee was applied for an assignment (idempotent debit).
ALTER TABLE public.intake_project_assignments
  ADD COLUMN IF NOT EXISTS deal_fee_recorded BOOLEAN NOT NULL DEFAULT FALSE;
