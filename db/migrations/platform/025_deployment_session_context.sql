-- AC-V6-10: product-neutral session context JSON (facility selection, etc.).
-- Additive only. BlessBoard may ignore the column.
-- Rollback: ALTER TABLE platform.deployment_sessions DROP COLUMN IF EXISTS context_json;

ALTER TABLE platform.deployment_sessions
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'deployment_sessions_context_json_object'
       AND conrelid = 'platform.deployment_sessions'::regclass
  ) THEN
    ALTER TABLE platform.deployment_sessions
      ADD CONSTRAINT deployment_sessions_context_json_object
        CHECK (jsonb_typeof(context_json) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'deployment_sessions_context_json_size'
       AND conrelid = 'platform.deployment_sessions'::regclass
  ) THEN
    ALTER TABLE platform.deployment_sessions
      ADD CONSTRAINT deployment_sessions_context_json_size
        CHECK (pg_column_size(context_json) <= 4096);
  END IF;
END $$;

COMMENT ON COLUMN platform.deployment_sessions.context_json IS
  'Product-scoped session UI context (e.g. ActiveClinic selectedFacilityId). Never stores secrets.';
