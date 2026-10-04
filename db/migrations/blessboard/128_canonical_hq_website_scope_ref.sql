-- Canonicalize BlessBoard church-wide website ownership.
-- Only organizations with exactly one church are eligible for backfill.
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO ambiguous_count
    FROM platform.website_instances i
   WHERE i.product_code = 'blessboard'
     AND i.scope_kind = 'church_wide'
     AND i.scope_ref IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM blessboard.churches c
        WHERE c.organization_id = i.organization_id
     );

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION
      'Cannot canonicalize % BlessBoard HQ website instances without a church',
      ambiguous_count;
  END IF;

  UPDATE platform.website_instances i
     SET scope_ref = c.id,
         updated_at = now()
    FROM blessboard.churches c
   WHERE i.product_code = 'blessboard'
     AND i.scope_kind = 'church_wide'
     AND i.scope_ref IS NULL
     AND c.organization_id = i.organization_id;
END $$;
