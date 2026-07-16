-- Controlled pilot feature flags (platform default + tenant override).
-- Works in addition to package entitlements. Idempotent via ensureChurchSchema.
-- No branch overrides in v1 (org-scoped Growth/Foundation capabilities).

CREATE TABLE IF NOT EXISTS public.church_pilot_feature_flag_platform_defaults (
  id BIGSERIAL PRIMARY KEY,
  flag_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reason TEXT,
  approver_label TEXT,
  approver_actor_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_actor_id INTEGER,
  CONSTRAINT church_pilot_ff_platform_key_len
    CHECK (char_length(flag_key) BETWEEN 1 AND 64),
  CONSTRAINT church_pilot_ff_platform_reason_len
    CHECK (reason IS NULL OR char_length(reason) <= 2000),
  CONSTRAINT church_pilot_ff_platform_approver_len
    CHECK (approver_label IS NULL OR char_length(approver_label) <= 200),
  CONSTRAINT church_pilot_ff_platform_window
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_church_pilot_ff_platform_key
  ON public.church_pilot_feature_flag_platform_defaults (flag_key);

CREATE TABLE IF NOT EXISTS public.church_pilot_feature_flag_tenant_overrides (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reason TEXT,
  approver_label TEXT,
  approver_actor_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_actor_id INTEGER,
  CONSTRAINT church_pilot_ff_tenant_key_len
    CHECK (char_length(flag_key) BETWEEN 1 AND 64),
  CONSTRAINT church_pilot_ff_tenant_reason_len
    CHECK (reason IS NULL OR char_length(reason) <= 2000),
  CONSTRAINT church_pilot_ff_tenant_approver_len
    CHECK (approver_label IS NULL OR char_length(approver_label) <= 200),
  CONSTRAINT church_pilot_ff_tenant_window
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_church_pilot_ff_tenant_org_key
  ON public.church_pilot_feature_flag_tenant_overrides (organization_id, flag_key);

CREATE INDEX IF NOT EXISTS idx_church_pilot_ff_tenant_org
  ON public.church_pilot_feature_flag_tenant_overrides (organization_id);

CREATE TABLE IF NOT EXISTS public.church_pilot_feature_flag_audit (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'tenant')),
  organization_id INTEGER
    REFERENCES public.church_organizations (id) ON DELETE SET NULL,
  flag_key TEXT NOT NULL,
  previous_enabled BOOLEAN,
  new_enabled BOOLEAN NOT NULL,
  previous_starts_at TIMESTAMPTZ,
  previous_ends_at TIMESTAMPTZ,
  new_starts_at TIMESTAMPTZ,
  new_ends_at TIMESTAMPTZ,
  reason TEXT,
  approver_label TEXT,
  actor_type TEXT,
  actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_pilot_ff_audit_key_len
    CHECK (char_length(flag_key) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_church_pilot_ff_audit_flag
  ON public.church_pilot_feature_flag_audit (flag_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_pilot_ff_audit_org
  ON public.church_pilot_feature_flag_audit (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
