-- Additive scope columns for shared platform audit (V8).
-- Nullable so existing V7 rows and writers remain valid.
-- Append-only triggers unchanged.

ALTER TABLE platform.audit_events
  ADD COLUMN IF NOT EXISTS product_code TEXT NULL;

ALTER TABLE platform.audit_events
  ADD COLUMN IF NOT EXISTS facility_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'audit_events_product_code_format'
       AND conrelid = 'platform.audit_events'::regclass
  ) THEN
    ALTER TABLE platform.audit_events
      ADD CONSTRAINT audit_events_product_code_format
      CHECK (
        product_code IS NULL
        OR product_code ~ '^[a-z][a-z0-9_]{1,31}$'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_events_org_product_created_idx
  ON platform.audit_events (organization_id, product_code, created_at DESC)
  WHERE product_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_facility_created_idx
  ON platform.audit_events (facility_id, created_at DESC)
  WHERE facility_id IS NOT NULL;

COMMENT ON COLUMN platform.audit_events.product_code IS
  'Optional product scope (blessboard|activeclinic|platform). Additive V8; null on legacy rows.';
COMMENT ON COLUMN platform.audit_events.facility_id IS
  'Optional ActiveClinic facility scope. Soft reference; additive V8.';
