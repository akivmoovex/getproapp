-- Singleton database identity for the shared physical database.
-- Never insert automatically from migrate or web workers — use db:identity:init.

CREATE TABLE IF NOT EXISTS platform.database_identity (
  id INTEGER PRIMARY KEY DEFAULT 1,
  database_instance_id UUID NOT NULL,
  environment_code TEXT NOT NULL,
  database_name TEXT NOT NULL,
  host_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT database_identity_singleton CHECK (id = 1),
  CONSTRAINT database_identity_environment_code_check
    CHECK (environment_code IN ('preproduction', 'shared', 'production', 'testing')),
  CONSTRAINT database_identity_database_name_len
    CHECK (char_length(database_name) BETWEEN 1 AND 128),
  CONSTRAINT database_identity_host_fingerprint_len
    CHECK (char_length(host_fingerprint) BETWEEN 1 AND 256)
);
