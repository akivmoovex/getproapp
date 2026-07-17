-- BlessBoard branches belong to a church (product-owned; not shared on platform).
-- Restrictive FK: deleting a church does not cascade to branches.

CREATE TABLE IF NOT EXISTS blessboard.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  short_name TEXT NULL,
  branch_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NULL,
  country_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT branches_church_branch_key_unique UNIQUE (church_id, branch_key),
  CONSTRAINT branches_branch_key_format
    CHECK (branch_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT branches_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT branches_short_name_len
    CHECK (short_name IS NULL OR char_length(short_name) BETWEEN 1 AND 80),
  CONSTRAINT branches_branch_type_check
    CHECK (branch_type IN ('hq', 'branch')),
  CONSTRAINT branches_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT branches_timezone_len
    CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT branches_country_code_format
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS branches_church_id_idx
  ON blessboard.branches (church_id);

CREATE INDEX IF NOT EXISTS branches_status_idx
  ON blessboard.branches (status);

-- At most one HQ branch per church.
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_hq_per_church_idx
  ON blessboard.branches (church_id)
  WHERE branch_type = 'hq';

-- At most one primary branch per church.
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_primary_per_church_idx
  ON blessboard.branches (church_id)
  WHERE is_primary = true;

CREATE OR REPLACE FUNCTION blessboard.prevent_branch_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_key IS DISTINCT FROM OLD.branch_key THEN
    RAISE EXCEPTION 'blessboard.branches.branch_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_branch_key_immutable ON blessboard.branches;
CREATE TRIGGER branches_branch_key_immutable
  BEFORE UPDATE ON blessboard.branches
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_branch_key_change();
