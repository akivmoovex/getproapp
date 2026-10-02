-- Prompt 10C: temporary audited Platform Admin support contexts.
-- Does not replace deployment sessions or create impersonation logins.

CREATE TABLE IF NOT EXISTS platform.support_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_code TEXT NOT NULL
    REFERENCES platform.deployments (deployment_code)
    ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL,
  branch_id UUID NULL,
  support_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  context_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  end_reason TEXT NULL,
  actor_session_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_contexts_type_check
    CHECK (support_type IN ('hq', 'branch')),
  CONSTRAINT support_contexts_status_check
    CHECK (status IN ('active', 'ended', 'expired')),
  CONSTRAINT support_contexts_reason_len
    CHECK (char_length(trim(reason)) >= 3 AND char_length(reason) <= 500),
  CONSTRAINT support_contexts_branch_required_for_branch_type
    CHECK (
      (support_type = 'hq' AND branch_id IS NULL)
      OR (support_type = 'branch' AND branch_id IS NOT NULL)
    ),
  CONSTRAINT support_contexts_token_hash_format
    CHECK (context_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT support_contexts_expiry_after_start
    CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS support_contexts_active_token_hash_uidx
  ON platform.support_contexts (context_token_hash)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS support_contexts_actor_active_idx
  ON platform.support_contexts (actor_user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS support_contexts_org_started_idx
  ON platform.support_contexts (organization_id, started_at DESC);
