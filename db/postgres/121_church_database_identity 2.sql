-- Singleton database identity for BlessBoard V4/V5 runtime isolation.
-- Idempotent via ensureChurchSchema. Never stores secrets or credentials.
--
-- This table lets the running application prove which PostgreSQL environment it is
-- connected to (testing vs production). No identity row is inserted automatically:
-- it must be initialized explicitly with scripts/init-church-database-identity.js so
-- a testing deployment can never silently start against a database marked production
-- (and vice versa). The `id = 1` CHECK plus PRIMARY KEY enforce a single row.

CREATE TABLE IF NOT EXISTS public.church_database_identity (
  id INTEGER PRIMARY KEY DEFAULT 1,
  environment_code TEXT NOT NULL,
  deployment_name TEXT,
  database_instance_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_database_identity_singleton CHECK (id = 1),
  CONSTRAINT church_database_identity_env_code
    CHECK (environment_code IN ('testing', 'production')),
  CONSTRAINT church_database_identity_deployment_name_len
    CHECK (deployment_name IS NULL OR char_length(deployment_name) <= 120)
);
