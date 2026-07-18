-- Immutable append-only audit trail (cross-product platform scope).
-- church_id / branch_id / actor_user_id are soft references (no product-schema FKs).
-- Application code must INSERT only; UPDATE/DELETE blocked by triggers.

CREATE TABLE IF NOT EXISTS platform.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_code TEXT NOT NULL
    REFERENCES platform.deployments (deployment_code)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NULL,
  branch_id UUID NULL,
  actor_user_id UUID NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NULL,
  outcome TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_action_key_format
    CHECK (action_key ~ '^[a-z][a-z0-9_.]{1,95}$'),
  CONSTRAINT audit_events_entity_type_format
    CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT audit_events_outcome_check
    CHECK (outcome IN ('success', 'failure', 'denied')),
  CONSTRAINT audit_events_metadata_is_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT audit_events_metadata_size
    CHECK (pg_column_size(metadata_json) <= 8192)
);

CREATE INDEX IF NOT EXISTS audit_events_org_created_idx
  ON platform.audit_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_org_action_created_idx
  ON platform.audit_events (organization_id, action_key, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_church_created_idx
  ON platform.audit_events (church_id, created_at DESC)
  WHERE church_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_deployment_created_idx
  ON platform.audit_events (deployment_code, created_at DESC);

CREATE OR REPLACE FUNCTION platform.prevent_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform.audit_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_update ON platform.audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON platform.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_audit_events_mutation();

DROP TRIGGER IF EXISTS audit_events_no_delete ON platform.audit_events;
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON platform.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_audit_events_mutation();
