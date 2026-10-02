-- V2.04 Phase 7 — Platform reusable approval-request foundation (additive).
-- Product adapters own semantics (e.g. BB ministry/department join).
-- Platform owns statuses, self-approval denial, decision history.

CREATE TABLE IF NOT EXISTS platform.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  request_type TEXT NOT NULL,
  requester_subject_type TEXT NOT NULL DEFAULT 'user',
  requester_subject_id UUID NOT NULL,
  requester_user_id UUID NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_reviewer_user_id UUID NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_reason TEXT NULL,
  decided_by_user_id UUID NULL,
  decided_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_by_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_product_code_format
    CHECK (product_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT approval_requests_request_type_len
    CHECK (char_length(request_type) BETWEEN 1 AND 64),
  CONSTRAINT approval_requests_target_type_len
    CHECK (char_length(target_type) BETWEEN 1 AND 64),
  CONSTRAINT approval_requests_requester_subject_type_check
    CHECK (requester_subject_type IN ('user', 'member', 'staff', 'identity')),
  CONSTRAINT approval_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT approval_requests_decision_reason_len
    CHECK (decision_reason IS NULL OR char_length(decision_reason) BETWEEN 1 AND 1000),
  CONSTRAINT approval_requests_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_pending_unique_uidx
  ON platform.approval_requests (
    organization_id,
    product_code,
    request_type,
    requester_subject_id,
    target_type,
    target_id
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS approval_requests_org_status_idx
  ON platform.approval_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS approval_requests_target_idx
  ON platform.approval_requests (organization_id, target_type, target_id, status);

CREATE INDEX IF NOT EXISTS approval_requests_requester_idx
  ON platform.approval_requests (organization_id, requester_subject_id, status);

COMMENT ON TABLE platform.approval_requests IS
  'V2.04 reusable request/approval records. Product adapters own join/membership side effects.';

CREATE TABLE IF NOT EXISTS platform.approval_request_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL
    REFERENCES platform.approval_requests (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_request_decisions_from_status_check
    CHECK (from_status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT approval_request_decisions_to_status_check
    CHECK (to_status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT approval_request_decisions_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS approval_request_decisions_request_idx
  ON platform.approval_request_decisions (approval_request_id, created_at DESC);

COMMENT ON TABLE platform.approval_request_decisions IS
  'Append-only decision/history trail for approval_requests.';

-- Rollback notes (manual):
--   DROP TABLE IF EXISTS platform.approval_request_decisions;
--   DROP TABLE IF EXISTS platform.approval_requests;
