-- Baseline immutable version 1 for already-published BlessBoard websites
-- that have no publication snapshot yet. Does not change live content.

INSERT INTO blessboard.website_publication_versions (
  organization_id,
  church_id,
  version_number,
  status,
  theme_key,
  source_type,
  snapshot_json,
  change_summary_json,
  published_at
)
SELECT
  c.organization_id,
  c.id,
  1,
  'published',
  'default',
  'initial_setup',
  jsonb_build_object(
    'themeKey', 'default',
    'branchId', NULL,
    'pageKeys', ARRAY[]::text[],
    'pages', '[]'::jsonb,
    'entities', '{}'::jsonb,
    'baseline', true
  ),
  jsonb_build_object(
    'sourceType', 'initial_setup',
    'pageCount', 0,
    'note', 'Baseline version created for existing published website'
  ),
  now()
FROM blessboard.churches c
JOIN blessboard.church_settings s ON s.church_id = c.id
WHERE s.website_status = 'published'
  AND c.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM blessboard.website_publication_versions v
     WHERE v.organization_id = c.organization_id
       AND v.church_id = c.id
  );
