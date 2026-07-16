-- Growth pastoral-care automation: settings, work items, job runs, case lifecycle extensions.
-- Automation creates recommendations/work items; authorised admins remain accountable.
-- Safeguarding track unchanged. Foundation manual workflows unchanged.

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_supervise_pastoral BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.church_branch_admins.can_supervise_pastoral IS
  'When true, may acknowledge high-risk automated pastoral cases (Growth).';

ALTER TABLE public.church_pastoral_cases
  ADD COLUMN IF NOT EXISTS automation_work_item_id INTEGER,
  ADD COLUMN IF NOT EXISTS trigger_type TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS confidentiality_level TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supervisor_acknowledged_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opened_by_automation BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_status_check;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_status_check
  CHECK (status IN ('open', 'in_follow_up', 'closed', 'paused', 'pending_supervisor_ack', 'escalated'));

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_risk_check;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_risk_check
  CHECK (risk_level IN ('standard', 'high'));

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_confidentiality_check;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_confidentiality_check
  CHECK (confidentiality_level IN ('standard', 'restricted'));

DROP INDEX IF EXISTS public.idx_church_pastoral_cases_open_member;

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_pastoral_cases_open_member
  ON public.church_pastoral_cases (branch_id, member_id)
  WHERE status IN ('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated');

CREATE TABLE IF NOT EXISTS public.church_pastoral_automation_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  missed_service_threshold_weeks INTEGER,
  first_response_target_hours INTEGER NOT NULL DEFAULT 48,
  follow_up_target_days INTEGER NOT NULL DEFAULT 7,
  auto_create_cases BOOLEAN NOT NULL DEFAULT true,
  updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_pastoral_automation_settings_branch_unique UNIQUE (branch_id)
);

CREATE TABLE IF NOT EXISTS public.church_pastoral_automation_runs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  run_key TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'missed_service_scan',
  status TEXT NOT NULL DEFAULT 'running',
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT church_pastoral_automation_runs_key_unique UNIQUE (branch_id, run_key)
);

ALTER TABLE public.church_pastoral_automation_runs
  DROP CONSTRAINT IF EXISTS church_pastoral_automation_runs_status_check;

ALTER TABLE public.church_pastoral_automation_runs
  ADD CONSTRAINT church_pastoral_automation_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed'));

CREATE TABLE IF NOT EXISTS public.church_pastoral_automation_work_items (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'missed_service',
  status TEXT NOT NULL DEFAULT 'pending',
  risk_level TEXT NOT NULL DEFAULT 'standard',
  recommendation_summary TEXT NOT NULL DEFAULT '',
  confidentiality_level TEXT NOT NULL DEFAULT 'standard',
  pastoral_case_id INTEGER REFERENCES public.church_pastoral_cases (id) ON DELETE SET NULL,
  automation_run_id INTEGER REFERENCES public.church_pastoral_automation_runs (id) ON DELETE SET NULL,
  dismissed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  accepted_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_pastoral_automation_work_items
  DROP CONSTRAINT IF EXISTS church_pastoral_automation_work_items_status_check;

ALTER TABLE public.church_pastoral_automation_work_items
  ADD CONSTRAINT church_pastoral_automation_work_items_status_check
  CHECK (status IN ('pending', 'accepted', 'dismissed', 'converted'));

ALTER TABLE public.church_pastoral_automation_work_items
  DROP CONSTRAINT IF EXISTS church_pastoral_automation_work_items_risk_check;

ALTER TABLE public.church_pastoral_automation_work_items
  ADD CONSTRAINT church_pastoral_automation_work_items_risk_check
  CHECK (risk_level IN ('standard', 'high'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_pastoral_automation_work_items_active_member
  ON public.church_pastoral_automation_work_items (branch_id, member_id, trigger_type)
  WHERE status IN ('pending', 'converted');

CREATE INDEX IF NOT EXISTS idx_church_pastoral_automation_work_items_branch_status
  ON public.church_pastoral_automation_work_items (branch_id, status, created_at DESC);

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_automation_work_item_fk;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_automation_work_item_fk
  FOREIGN KEY (automation_work_item_id) REFERENCES public.church_pastoral_automation_work_items (id) ON DELETE SET NULL;

COMMENT ON TABLE public.church_pastoral_automation_work_items IS
  'Growth automation recommendations. Human acceptance required before operational accountability transfers.';
