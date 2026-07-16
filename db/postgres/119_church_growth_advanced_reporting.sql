-- BlessBoard Growth advanced reporting: saved filters + monthly report lock.
-- Idempotent via ensureChurchSchema.
-- No custom report builder / public API / Network executive dashboards.

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE public.church_monthly_reports
  ADD COLUMN IF NOT EXISTS locked_by_hq_admin_id INTEGER
    REFERENCES public.church_hq_admins (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.church_monthly_reports.locked_at IS
  'Set when HQ approves the report; branch edits are blocked while locked.';

CREATE TABLE IF NOT EXISTS public.church_saved_report_filters (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER
    REFERENCES public.church_branches (id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  name TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_saved_report_filters_surface_check
    CHECK (surface IN ('cross_branch', 'scheduled_report', 'branch_basic')),
  CONSTRAINT church_saved_report_filters_name_len
    CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_church_saved_report_filters_org_surface
  ON public.church_saved_report_filters (organization_id, surface, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_saved_report_filters_branch
  ON public.church_saved_report_filters (branch_id, surface)
  WHERE branch_id IS NOT NULL;

COMMENT ON TABLE public.church_saved_report_filters IS
  'Growth saved filter presets for reporting surfaces. Permissions re-checked when applied.';
