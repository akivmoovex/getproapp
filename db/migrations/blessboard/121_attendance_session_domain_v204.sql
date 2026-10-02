-- V2.04 Phase 6 — BlessBoard session-based attendance domain (additive).
-- Coexists with aggregate attendance_events (023). No Stitch UI.
-- Offline sync NOT implemented — offline_ingest_boundary table reserves queue shape only.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'attendance.check_in',
    'attendance',
    'check_in',
    'Check in attendance',
    'Record member attendance check-ins (manual, QR, PEAK)',
    'standard'
  ),
  (
    'attendance.correct',
    'attendance',
    'correct',
    'Correct attendance',
    'Correct attendance records with reason and audit',
    'sensitive'
  ),
  (
    'attendance.manage_session',
    'attendance',
    'manage_session',
    'Manage attendance sessions',
    'Create and transition attendance sessions (draft/open/closed/locked)',
    'standard'
  )
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
   'organisation_administrator',
   'church_system_administrator',
   'branch_administrator',
   'platform_administrator'
 )
   AND p.permission_key IN (
     'attendance.check_in',
     'attendance.correct',
     'attendance.manage_session',
     'attendance.view',
     'attendance.record'
   )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  service_event_ref TEXT NULL,
  attendance_event_id UUID NULL
    REFERENCES blessboard.attendance_events (id)
    ON DELETE SET NULL,
  session_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  late_threshold_minutes INT NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NULL,
  wrong_branch_policy TEXT NOT NULL DEFAULT 'record',
  opened_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  locked_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  updated_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_status_check
    CHECK (status IN ('draft', 'open', 'closed', 'locked')),
  CONSTRAINT attendance_sessions_late_threshold_check
    CHECK (late_threshold_minutes >= 0 AND late_threshold_minutes <= 240),
  CONSTRAINT attendance_sessions_wrong_branch_policy_check
    CHECK (wrong_branch_policy IN ('record', 'require_review', 'deny')),
  CONSTRAINT attendance_sessions_service_event_ref_len
    CHECK (service_event_ref IS NULL OR char_length(service_event_ref) BETWEEN 1 AND 120),
  CONSTRAINT attendance_sessions_title_len
    CHECK (char_length(title) <= 200),
  CONSTRAINT attendance_sessions_notes_len
    CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT attendance_sessions_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS attendance_sessions_church_date_idx
  ON blessboard.attendance_sessions (church_id, session_date DESC, status);

CREATE INDEX IF NOT EXISTS attendance_sessions_branch_status_idx
  ON blessboard.attendance_sessions (branch_id, status, start_time DESC);

COMMENT ON TABLE blessboard.attendance_sessions IS
  'V2.04 session-based attendance. States: draft|open|closed|locked. Aggregate events remain separate.';

COMMENT ON COLUMN blessboard.attendance_sessions.wrong_branch_policy IS
  'Church policy for membership branch ≠ attendance branch: record|require_review|deny. Default record (do not auto-reject).';

-- ---------------------------------------------------------------------------
-- Check-ins (one active record per member/session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.attendance_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  session_id UUID NOT NULL
    REFERENCES blessboard.attendance_sessions (id)
    ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  membership_branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  attendance_branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  late_arrival BOOLEAN NOT NULL DEFAULT false,
  wrong_branch BOOLEAN NOT NULL DEFAULT false,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  guest_authorized BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ NULL,
  voided_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  void_reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_item_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_check_ins_method_check
    CHECK (method IN ('manual', 'qr', 'peak')),
  CONSTRAINT attendance_check_ins_status_check
    CHECK (status IN ('present', 'late', 'voided')),
  CONSTRAINT attendance_check_ins_void_reason_len
    CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500),
  CONSTRAINT attendance_check_ins_client_item_len
    CHECK (client_item_id IS NULL OR char_length(client_item_id) BETWEEN 1 AND 120),
  CONSTRAINT attendance_check_ins_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_check_ins_member_session_active_uidx
  ON blessboard.attendance_check_ins (session_id, member_id)
  WHERE status <> 'voided';

CREATE INDEX IF NOT EXISTS attendance_check_ins_session_idx
  ON blessboard.attendance_check_ins (session_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS attendance_check_ins_branch_idx
  ON blessboard.attendance_check_ins (attendance_branch_id, checked_in_at DESC);

COMMENT ON COLUMN blessboard.attendance_check_ins.membership_branch_id IS
  'Member home/official membership branch at check-in time.';
COMMENT ON COLUMN blessboard.attendance_check_ins.attendance_branch_id IS
  'Branch where attendance was recorded (session branch).';
COMMENT ON COLUMN blessboard.attendance_check_ins.client_item_id IS
  'Reserved for future offline idempotency; unused in Phase 6.';

-- ---------------------------------------------------------------------------
-- Opaque QR / check-in tokens (no Church ID, phone, or PII in payload)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.attendance_check_in_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  session_id UUID NOT NULL
    REFERENCES blessboard.attendance_sessions (id)
    ON DELETE CASCADE,
  token_kind TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  member_id UUID NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  redeemed_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_check_in_tokens_kind_check
    CHECK (token_kind IN ('session', 'member_claim')),
  CONSTRAINT attendance_check_in_tokens_hash_len
    CHECK (char_length(token_hash) BETWEEN 32 AND 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_check_in_tokens_hash_uidx
  ON blessboard.attendance_check_in_tokens (token_hash);

CREATE INDEX IF NOT EXISTS attendance_check_in_tokens_session_idx
  ON blessboard.attendance_check_in_tokens (session_id, token_kind, expires_at);

COMMENT ON TABLE blessboard.attendance_check_in_tokens IS
  'Opaque signed/time-limited attendance tokens. Payload must not include Church ID, phone, or member PII.';

-- ---------------------------------------------------------------------------
-- Corrections (authorized history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  check_in_id UUID NOT NULL
    REFERENCES blessboard.attendance_check_ins (id)
    ON DELETE CASCADE,
  actor_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  original_value_json JSONB NOT NULL,
  corrected_value_json JSONB NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_corrections_reason_len
    CHECK (char_length(reason) BETWEEN 3 AND 500)
);

CREATE INDEX IF NOT EXISTS attendance_corrections_check_in_idx
  ON blessboard.attendance_corrections (check_in_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Offline boundary (shape only — no sync implementation in Phase 6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.attendance_offline_ingest_boundary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  client_item_id TEXT NOT NULL,
  session_id UUID NULL
    REFERENCES blessboard.attendance_sessions (id)
    ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingest_status TEXT NOT NULL DEFAULT 'reserved',
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_offline_ingest_status_check
    CHECK (ingest_status IN ('reserved', 'pending', 'synced', 'duplicate', 'conflict', 'failed')),
  CONSTRAINT attendance_offline_ingest_client_item_len
    CHECK (char_length(client_item_id) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_offline_ingest_client_uidx
  ON blessboard.attendance_offline_ingest_boundary (organization_id, branch_id, client_item_id);

COMMENT ON TABLE blessboard.attendance_offline_ingest_boundary IS
  'Phase 6 boundary only. Complex offline sync/reconciliation is intentionally NOT implemented.';

-- ---------------------------------------------------------------------------
-- Rollback notes (manual):
--   DROP TABLE IF EXISTS blessboard.attendance_offline_ingest_boundary;
--   DROP TABLE IF EXISTS blessboard.attendance_corrections;
--   DROP TABLE IF EXISTS blessboard.attendance_check_in_tokens;
--   DROP TABLE IF EXISTS blessboard.attendance_check_ins;
--   DROP TABLE IF EXISTS blessboard.attendance_sessions;
--   DELETE FROM blessboard.role_permissions WHERE permission_id IN
--     (SELECT id FROM blessboard.permissions WHERE permission_key IN
--       ('attendance.check_in','attendance.correct','attendance.session.manage'));
--   DELETE FROM blessboard.permissions WHERE permission_key IN
--     ('attendance.check_in','attendance.correct','attendance.manage_session');
-- ---------------------------------------------------------------------------
