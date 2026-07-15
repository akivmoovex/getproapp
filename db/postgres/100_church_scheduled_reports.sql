-- BlessBoard Growth scheduled reports.
-- Idempotent via ensureChurchSchema.
-- Foundation cannot schedule (enforced in app via entitlements + quota 0).

CREATE TABLE IF NOT EXISTS public.church_scheduled_reports (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER
    REFERENCES public.church_branches (id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  export_format TEXT NOT NULL DEFAULT 'csv',
  frequency TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  delivery_time_local TIME NOT NULL DEFAULT '09:00',
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  status TEXT NOT NULL DEFAULT 'enabled',
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id INTEGER,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_sched_reports_format_check
    CHECK (export_format IN ('csv', 'pdf')),
  CONSTRAINT church_sched_reports_frequency_check
    CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT church_sched_reports_status_check
    CHECK (status IN ('enabled', 'paused', 'cancelled')),
  CONSTRAINT church_sched_reports_dow_check
    CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
  CONSTRAINT church_sched_reports_dom_check
    CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28))
);

CREATE INDEX IF NOT EXISTS idx_church_sched_reports_org
  ON public.church_scheduled_reports (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_church_sched_reports_due
  ON public.church_scheduled_reports (next_run_at)
  WHERE status = 'enabled';

CREATE TABLE IF NOT EXISTS public.church_scheduled_report_recipients (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL
    REFERENCES public.church_scheduled_reports (id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_sched_report_recipients_type_check
    CHECK (recipient_type IN ('branch_admin', 'hq_admin')),
  CONSTRAINT church_sched_report_recipients_unique
    UNIQUE (schedule_id, recipient_type, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_church_sched_report_recipients_org
  ON public.church_scheduled_report_recipients (organization_id);

CREATE TABLE IF NOT EXISTS public.church_scheduled_report_runs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL
    REFERENCES public.church_scheduled_reports (id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  export_format TEXT NOT NULL,
  export_sha256 TEXT,
  export_byte_length INTEGER,
  export_body TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_sched_report_runs_status_check
    CHECK (status IN ('pending', 'running', 'delivered', 'failed', 'skipped')),
  CONSTRAINT church_sched_report_runs_job_key UNIQUE (job_key)
);

CREATE INDEX IF NOT EXISTS idx_church_sched_report_runs_org
  ON public.church_scheduled_report_runs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_sched_report_runs_retry
  ON public.church_scheduled_report_runs (status, attempt_count)
  WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS public.church_scheduled_report_deliveries (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL
    REFERENCES public.church_scheduled_report_runs (id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_sched_report_deliveries_status_check
    CHECK (status IN ('delivered', 'failed', 'skipped_unauthorised')),
  CONSTRAINT church_sched_report_deliveries_idem UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_church_sched_report_deliveries_org
  ON public.church_scheduled_report_deliveries (organization_id, created_at DESC);
