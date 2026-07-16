-- Branch admin report permissions (Foundation basic reporting).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_view_finance BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_export_reports BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.church_branch_admins.can_view_finance IS
  'When true, branch admin may view giving totals in Foundation basic reports.';

COMMENT ON COLUMN public.church_branch_admins.can_export_reports IS
  'When true, branch admin may export Foundation basic reports (CSV/PDF).';
