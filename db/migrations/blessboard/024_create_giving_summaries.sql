-- BlessBoard V5 manual giving summaries (aggregated entries).
-- No donor PII, card/bank details, or payment gateways.
-- Amounts are NUMERIC — never floating point.

CREATE TABLE IF NOT EXISTS blessboard.giving_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  category_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT giving_categories_key_format
    CHECK (category_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT giving_categories_label_len
    CHECK (char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT giving_categories_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT giving_categories_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT giving_categories_church_key_unique
    UNIQUE (church_id, category_key),
  CONSTRAINT giving_categories_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS giving_categories_church_sort_idx
  ON blessboard.giving_categories (church_id, sort_order ASC, label ASC);

CREATE TABLE IF NOT EXISTS blessboard.giving_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  category_id UUID NOT NULL
    REFERENCES blessboard.giving_categories (id)
    ON DELETE RESTRICT,
  giving_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  reference TEXT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  recorded_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  submitted_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NULL,
  approved_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NULL,
  voided_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ NULL,
  void_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT giving_entries_amount_non_negative
    CHECK (amount >= 0),
  CONSTRAINT giving_entries_currency_iso
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT giving_entries_reference_len
    CHECK (reference IS NULL OR char_length(reference) BETWEEN 1 AND 120),
  CONSTRAINT giving_entries_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  CONSTRAINT giving_entries_void_reason_len
    CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500),
  CONSTRAINT giving_entries_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'void')),
  CONSTRAINT giving_entries_submitted_consistency
    CHECK (
      (status IN ('submitted', 'approved') AND submitted_at IS NOT NULL)
      OR (status IN ('draft', 'void'))
    ),
  CONSTRAINT giving_entries_approved_consistency
    CHECK (
      (status = 'approved' AND approved_at IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'void'))
    ),
  CONSTRAINT giving_entries_void_consistency
    CHECK (
      (status = 'void' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'approved') AND voided_at IS NULL)
    ),
  CONSTRAINT giving_entries_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS giving_entries_church_date_idx
  ON blessboard.giving_entries (church_id, giving_date DESC);

CREATE INDEX IF NOT EXISTS giving_entries_branch_date_idx
  ON blessboard.giving_entries (branch_id, giving_date DESC, status);

CREATE INDEX IF NOT EXISTS giving_entries_church_status_idx
  ON blessboard.giving_entries (church_id, status, giving_date DESC);

DROP TRIGGER IF EXISTS giving_entries_branch_owns_church ON blessboard.giving_entries;
CREATE TRIGGER giving_entries_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.giving_entries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.require_giving_entry_category_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_church UUID;
BEGIN
  SELECT c.church_id INTO category_church
    FROM blessboard.giving_categories c
   WHERE c.id = NEW.category_id;
  IF category_church IS NULL THEN
    RAISE EXCEPTION 'giving category % not found', NEW.category_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF category_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'giving entry category must belong to same church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS giving_entries_category_church ON blessboard.giving_entries;
CREATE TRIGGER giving_entries_category_church
  BEFORE INSERT OR UPDATE OF church_id, category_id
  ON blessboard.giving_entries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_giving_entry_category_church();

CREATE OR REPLACE FUNCTION blessboard.prevent_giving_void_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'voided giving entry cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS giving_entries_no_void_reactivation ON blessboard.giving_entries;
CREATE TRIGGER giving_entries_no_void_reactivation
  BEFORE UPDATE OF status ON blessboard.giving_entries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_giving_void_reactivation();
