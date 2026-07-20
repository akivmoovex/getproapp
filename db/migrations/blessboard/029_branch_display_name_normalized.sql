-- Branch display_name uniqueness within church_id (BlessBoard V5).
-- Ownership: blessboard.branches.church_id (product rule: one church per organization via
-- blessboard.churches.organization_id UNIQUE). Uniqueness does NOT span other organizations.
-- Does NOT make platform.organizations.display_name globally unique.
--
-- Normalization (generated column + JS normalizeBranchDisplayName must match):
--   lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'))
-- Punctuation is preserved. User-facing display_name is unchanged.
--
-- Live uniqueness excludes archived branches so archived names may be reused.
--
-- Existing duplicates: this migration FAILS with a precise EXCEPTION listing sample groups.
-- Operators must resolve duplicates manually before re-running (no auto-rename).

ALTER TABLE blessboard.branches
  ADD COLUMN IF NOT EXISTS display_name_normalized TEXT
  GENERATED ALWAYS AS (
    lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'))
  ) STORED;

DO $$
DECLARE
  duplicate_groups INT;
  sample TEXT;
BEGIN
  SELECT COUNT(*)::int INTO duplicate_groups
    FROM (
      SELECT church_id, display_name_normalized
        FROM blessboard.branches
       WHERE status IN ('active', 'inactive', 'suspended')
         AND display_name_normalized IS NOT NULL
         AND display_name_normalized <> ''
       GROUP BY church_id, display_name_normalized
      HAVING COUNT(*) > 1
    ) d;

  IF duplicate_groups > 0 THEN
    SELECT string_agg(
             format('church=%s name=%s count=%s', church_id, display_name_normalized, cnt),
             '; '
           )
      INTO sample
      FROM (
        SELECT church_id, display_name_normalized, COUNT(*)::int AS cnt
          FROM blessboard.branches
         WHERE status IN ('active', 'inactive', 'suspended')
           AND display_name_normalized IS NOT NULL
           AND display_name_normalized <> ''
         GROUP BY church_id, display_name_normalized
        HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC
         LIMIT 5
      ) s;

    RAISE EXCEPTION
      '029 branch display_name: % duplicate group(s) under church_id for live statuses (active|inactive|suspended). Resolve manually before applying unique index. Samples: %',
      duplicate_groups,
      COALESCE(sample, '(none)')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RAISE NOTICE
    '029 branch display_name: no live duplicate groups; applying unique index on (church_id, display_name_normalized)';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS branches_church_display_name_normalized_live_uidx
  ON blessboard.branches (church_id, display_name_normalized)
  WHERE status IN ('active', 'inactive', 'suspended')
    AND display_name_normalized IS NOT NULL
    AND display_name_normalized <> '';

CREATE INDEX IF NOT EXISTS branches_display_name_normalized_idx
  ON blessboard.branches (display_name_normalized);
