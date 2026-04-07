-- Slice 1: mirror table for join/callback interest rows (API: POST /api/callback-interest)
-- Apply in Supabase SQL editor or: psql "$DATABASE_URL" -f db/postgres/001_callback_interests.sql
-- FK to tenants is omitted until tenants exist in PostgreSQL; tenant_id matches SQLite tenants.id.

CREATE TABLE IF NOT EXISTS callback_interests (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  tenant_id BIGINT NOT NULL,
  interest_label TEXT NOT NULL DEFAULT 'Potential Partner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callback_interests_tenant_created
  ON callback_interests (tenant_id, created_at DESC);

COMMENT ON TABLE callback_interests IS 'Callback / join interest rows; app uses this table when DATABASE_URL is set (see docs/SUPABASE_SLICE1_CALLBACKS.md)';
