-- Growth cross-branch comparison: HQ finance permission for giving columns.
-- Idempotent via ensureChurchSchema.

ALTER TABLE public.church_hq_admins
  ADD COLUMN IF NOT EXISTS can_view_finance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.church_hq_admins.can_view_finance IS
  'Separate finance permission required to view giving totals on Growth cross-branch comparison.';
