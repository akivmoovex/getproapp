-- BlessBoard Growth trial entitlements (30-day).
-- Idempotent: safe via ensureChurchSchema.
-- No payment collection. No Network features.

CREATE TABLE IF NOT EXISTS public.church_organization_package_trials (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  trial_kind TEXT NOT NULL DEFAULT 'growth_30_day',
  status TEXT NOT NULL DEFAULT 'active',
  previous_plan_code TEXT,
  previous_package_code TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  granted_by_platform_admin_id INTEGER,
  grant_reason TEXT NOT NULL,
  expired_at TIMESTAMPTZ,
  expiry_job_key TEXT,
  config_retain_until TIMESTAMPTZ,
  config_purged_at TIMESTAMPTZ,
  growth_config_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_org_package_trials_kind_check
    CHECK (trial_kind IN ('growth_30_day')),
  CONSTRAINT church_org_package_trials_status_check
    CHECK (status IN ('active', 'expired', 'cancelled')),
  CONSTRAINT church_org_package_trials_window_check
    CHECK (ends_at > starts_at),
  CONSTRAINT church_org_package_trials_duration_check
    CHECK (duration_days > 0 AND duration_days <= 366)
);

-- One Growth trial per organisation by default.
CREATE UNIQUE INDEX IF NOT EXISTS church_org_growth_trial_once
  ON public.church_organization_package_trials (organization_id)
  WHERE trial_kind = 'growth_30_day';

CREATE UNIQUE INDEX IF NOT EXISTS church_org_package_trials_expiry_job_key
  ON public.church_organization_package_trials (expiry_job_key)
  WHERE expiry_job_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_org_package_trials_org_status
  ON public.church_organization_package_trials (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_church_org_package_trials_active_ends
  ON public.church_organization_package_trials (ends_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.church_organization_package_trial_reminders (
  id BIGSERIAL PRIMARY KEY,
  trial_id BIGINT NOT NULL
    REFERENCES public.church_organization_package_trials (id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  days_before_expiry INTEGER NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  job_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_org_trial_reminders_days_check
    CHECK (days_before_expiry IN (7, 3, 1)),
  CONSTRAINT church_org_trial_reminders_status_check
    CHECK (status IN ('pending', 'sent', 'skipped')),
  CONSTRAINT church_org_trial_reminders_unique_day
    UNIQUE (trial_id, days_before_expiry),
  CONSTRAINT church_org_trial_reminders_job_key
    UNIQUE (job_key)
);

CREATE INDEX IF NOT EXISTS idx_church_org_trial_reminders_due
  ON public.church_organization_package_trial_reminders (due_at)
  WHERE status = 'pending';
