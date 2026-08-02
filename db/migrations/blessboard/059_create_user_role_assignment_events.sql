-- BlessBoard V5 RBAC foundation: assignment history (append-oriented).
-- Complements platform.audit_events; never hard-delete history rows.

CREATE TABLE IF NOT EXISTS blessboard.user_role_assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL
    REFERENCES blessboard.user_role_assignments (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  event_key TEXT NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_role_assignment_events_event_key_check
    CHECK (event_key IN (
      'rbac.assignment.created',
      'rbac.assignment.revoked',
      'rbac.assignment.expired',
      'rbac.assignment.updated'
    )),
  CONSTRAINT user_role_assignment_events_previous_status_check
    CHECK (previous_status IS NULL OR previous_status IN ('active', 'revoked', 'expired')),
  CONSTRAINT user_role_assignment_events_new_status_check
    CHECK (new_status IS NULL OR new_status IN ('active', 'revoked', 'expired')),
  CONSTRAINT user_role_assignment_events_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT user_role_assignment_events_metadata_is_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT user_role_assignment_events_metadata_size
    CHECK (pg_column_size(metadata_json) <= 8192)
);

CREATE INDEX IF NOT EXISTS user_role_assignment_events_assignment_created_idx
  ON blessboard.user_role_assignment_events (assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_role_assignment_events_org_created_idx
  ON blessboard.user_role_assignment_events (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.prevent_user_role_assignment_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'blessboard.user_role_assignment_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS user_role_assignment_events_no_update ON blessboard.user_role_assignment_events;
CREATE TRIGGER user_role_assignment_events_no_update
  BEFORE UPDATE ON blessboard.user_role_assignment_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_user_role_assignment_events_mutation();

DROP TRIGGER IF EXISTS user_role_assignment_events_no_delete ON blessboard.user_role_assignment_events;
CREATE TRIGGER user_role_assignment_events_no_delete
  BEFORE DELETE ON blessboard.user_role_assignment_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_user_role_assignment_events_mutation();
