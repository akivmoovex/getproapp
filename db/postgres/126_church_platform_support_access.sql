-- BlessBoard V5: Platform Support Access + Account Manager MVP.
-- Idempotent via ensureChurchSchema. Does not rewrite tenant data.
-- No impersonation / session takeover.

-- ---------------------------------------------------------------------------
-- Account manager assignments (primary + backup per organization)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_organization_account_managers (
  organization_id BIGINT PRIMARY KEY
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  primary_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  backup_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_by_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  internal_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_organization_account_managers_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT church_organization_account_managers_distinct_check
    CHECK (
      primary_admin_user_id IS NULL
      OR backup_admin_user_id IS NULL
      OR primary_admin_user_id <> backup_admin_user_id
    )
);

CREATE INDEX IF NOT EXISTS idx_church_org_account_managers_primary
  ON public.church_organization_account_managers (primary_admin_user_id)
  WHERE primary_admin_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_org_account_managers_backup
  ON public.church_organization_account_managers (backup_admin_user_id)
  WHERE backup_admin_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Time-limited, approved support access grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_platform_support_access (
  id BIGSERIAL PRIMARY KEY,
  support_admin_user_id INTEGER NOT NULL
    REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id BIGINT
    REFERENCES public.church_branches (id) ON DELETE CASCADE,
  ticket_reference TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_platform_support_access_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked')),
  CONSTRAINT church_platform_support_access_scope_check
    CHECK (requested_scope IN (
      'redacted_diagnostics',
      'configuration',
      'user_support',
      'content_support',
      'job_support'
    )),
  CONSTRAINT church_platform_support_access_ticket_check
    CHECK (char_length(trim(ticket_reference)) >= 1 AND char_length(ticket_reference) <= 120),
  CONSTRAINT church_platform_support_access_reason_check
    CHECK (char_length(trim(reason)) >= 3 AND char_length(reason) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_access_org_status
  ON public.church_platform_support_access (organization_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_access_support_user
  ON public.church_platform_support_access (support_admin_user_id, status);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_access_branch
  ON public.church_platform_support_access (branch_id)
  WHERE branch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Support-access audit events (no confidential tenant payloads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_platform_support_access_events (
  id BIGSERIAL PRIMARY KEY,
  access_id BIGINT NOT NULL
    REFERENCES public.church_platform_support_access (id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_admin_user_id INTEGER
    REFERENCES public.admin_users (id) ON DELETE SET NULL,
  action_summary TEXT NOT NULL DEFAULT '',
  church_visible BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_platform_support_access_events_type_check
    CHECK (event_type IN (
      'request',
      'approval',
      'rejection',
      'use',
      'denied_use',
      'expiry',
      'revocation'
    ))
);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_access_events_org
  ON public.church_platform_support_access_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_access_events_access
  ON public.church_platform_support_access_events (access_id, created_at DESC);
