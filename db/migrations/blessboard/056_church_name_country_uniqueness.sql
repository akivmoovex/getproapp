-- Additive: church display-name uniqueness within country (BlessBoard V5).
-- Scope: (country_code, name_uniqueness_key) for live church statuses.
-- name_uniqueness_key is application-authored (see normalizeChurchDisplayNameForUniqueness).
-- Does NOT make display_name globally unique.
-- Does NOT delete/rename/merge existing churches.
--
-- Follows 055_user_action_tokens_and_invitation_delivery.sql.
--
-- If live duplicates exist after backfill, the unique index is skipped (NOTICE).
-- Service-layer enforcement still blocks new duplicates.

ALTER TABLE blessboard.churches
  ADD COLUMN IF NOT EXISTS country_code TEXT NULL;

ALTER TABLE blessboard.churches
  ADD COLUMN IF NOT EXISTS name_uniqueness_key TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'churches_country_code_format'
       AND conrelid = 'blessboard.churches'::regclass
  ) THEN
    ALTER TABLE blessboard.churches
      ADD CONSTRAINT churches_country_code_format
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'churches_name_uniqueness_key_len'
       AND conrelid = 'blessboard.churches'::regclass
  ) THEN
    ALTER TABLE blessboard.churches
      ADD CONSTRAINT churches_name_uniqueness_key_len
        CHECK (
          name_uniqueness_key IS NULL
          OR char_length(btrim(name_uniqueness_key)) BETWEEN 1 AND 200
        );
  END IF;
END $$;

-- Backfill country_code from HQ / primary / any branch when missing.
UPDATE blessboard.churches c
   SET country_code = src.country_code
  FROM (
    SELECT DISTINCT ON (b.church_id)
           b.church_id,
           upper(b.country_code) AS country_code
      FROM blessboard.branches b
     WHERE b.country_code IS NOT NULL
       AND b.country_code ~ '^[A-Za-z]{2}$'
     ORDER BY b.church_id,
              CASE
                WHEN b.branch_type = 'hq' THEN 0
                WHEN b.is_primary THEN 1
                ELSE 2
              END,
              b.created_at ASC
  ) src
 WHERE c.id = src.church_id
   AND c.country_code IS NULL;

-- Approximate backfill for uniqueness key (lower + collapse whitespace).
-- Application inserts use the full JS normalizer; this unlocks the unique index when safe.
UPDATE blessboard.churches
   SET name_uniqueness_key = lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'))
 WHERE name_uniqueness_key IS NULL
   AND display_name IS NOT NULL
   AND btrim(display_name) <> '';

CREATE INDEX IF NOT EXISTS churches_name_uniqueness_key_idx
  ON blessboard.churches (name_uniqueness_key)
  WHERE name_uniqueness_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS churches_country_code_idx
  ON blessboard.churches (country_code)
  WHERE country_code IS NOT NULL;

DO $$
DECLARE
  duplicate_groups INT;
  sample TEXT;
BEGIN
  SELECT COUNT(*)::int INTO duplicate_groups
    FROM (
      SELECT country_code, name_uniqueness_key
        FROM blessboard.churches
       WHERE status IN ('active', 'inactive', 'suspended')
         AND country_code IS NOT NULL
         AND name_uniqueness_key IS NOT NULL
         AND name_uniqueness_key <> ''
       GROUP BY country_code, name_uniqueness_key
      HAVING COUNT(*) > 1
    ) d;

  IF duplicate_groups > 0 THEN
    SELECT string_agg(
             format('country=%s name=%s count=%s', country_code, name_uniqueness_key, cnt),
             '; '
           )
      INTO sample
      FROM (
        SELECT country_code, name_uniqueness_key, COUNT(*)::int AS cnt
          FROM blessboard.churches
         WHERE status IN ('active', 'inactive', 'suspended')
           AND country_code IS NOT NULL
           AND name_uniqueness_key IS NOT NULL
           AND name_uniqueness_key <> ''
         GROUP BY country_code, name_uniqueness_key
        HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC
         LIMIT 5
      ) s;

    RAISE NOTICE
      '056 church name uniqueness: % live duplicate group(s) — unique index NOT applied. Resolve manually. Samples: %',
      duplicate_groups,
      COALESCE(sample, '(none)');
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS churches_country_name_uniqueness_live_uidx
      ON blessboard.churches (country_code, name_uniqueness_key)
      WHERE status IN ('active', 'inactive', 'suspended')
        AND country_code IS NOT NULL
        AND name_uniqueness_key IS NOT NULL
        AND name_uniqueness_key <> '';

    RAISE NOTICE
      '056 church name uniqueness: no live duplicate groups; unique index applied on (country_code, name_uniqueness_key)';
  END IF;
END $$;
