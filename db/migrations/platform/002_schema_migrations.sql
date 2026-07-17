-- Migration ledger for the clean multi-schema foundation.
-- Unique (module, version). Checksums are enforced by the runner (drift rejection).

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  module TEXT NOT NULL,
  version TEXT NOT NULL,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0),
  PRIMARY KEY (module, version)
);

CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx
  ON platform.schema_migrations (applied_at);
