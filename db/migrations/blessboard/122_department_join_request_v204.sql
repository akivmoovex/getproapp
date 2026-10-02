-- V2.04 Phase 7 — Department join request statuses (additive).
-- Align department_memberships with ministry pending join (no immediate active add).

ALTER TABLE blessboard.department_memberships
  DROP CONSTRAINT IF EXISTS department_memberships_status_check;

ALTER TABLE blessboard.department_memberships
  ADD CONSTRAINT department_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'cancelled', 'inactive', 'exited'));

COMMENT ON COLUMN blessboard.department_memberships.status IS
  'V2.04: pending|active|rejected|cancelled|inactive|exited. Join requests start pending.';

-- Optional join policy on departments (default request = pending approval).
ALTER TABLE blessboard.departments
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'request';

ALTER TABLE blessboard.departments
  DROP CONSTRAINT IF EXISTS departments_join_policy_check;

ALTER TABLE blessboard.departments
  ADD CONSTRAINT departments_join_policy_check
  CHECK (join_policy IN ('open', 'request'));

CREATE UNIQUE INDEX IF NOT EXISTS department_memberships_open_uidx
  ON blessboard.department_memberships (department_id, member_id)
  WHERE status IN ('pending', 'active');

-- Link optional platform approval request on memberships (additive).
ALTER TABLE blessboard.ministry_memberships
  ADD COLUMN IF NOT EXISTS approval_request_id UUID NULL;

ALTER TABLE blessboard.department_memberships
  ADD COLUMN IF NOT EXISTS approval_request_id UUID NULL;

COMMENT ON COLUMN blessboard.ministry_memberships.approval_request_id IS
  'Optional link to platform.approval_requests for V2.04 join workflow.';
COMMENT ON COLUMN blessboard.department_memberships.approval_request_id IS
  'Optional link to platform.approval_requests for V2.04 join workflow.';

-- Rollback notes (manual):
--   ALTER TABLE blessboard.ministry_memberships DROP COLUMN IF EXISTS approval_request_id;
--   ALTER TABLE blessboard.department_memberships DROP COLUMN IF EXISTS approval_request_id;
--   DROP INDEX IF EXISTS blessboard.department_memberships_open_uidx;
--   ALTER TABLE blessboard.departments DROP COLUMN IF EXISTS join_policy;
