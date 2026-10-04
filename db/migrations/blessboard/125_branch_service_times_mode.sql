-- Explicit branch service-times policy. NULL is intentionally treated as inherit.
ALTER TABLE blessboard.branches
  ADD COLUMN IF NOT EXISTS service_times_mode TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'branches_service_times_mode_check'
  ) THEN
    ALTER TABLE blessboard.branches
      ADD CONSTRAINT branches_service_times_mode_check
      CHECK (service_times_mode IS NULL OR service_times_mode IN ('inherit', 'override', 'hidden'));
  END IF;
END $$;

-- Preserve existing branch-specific content as an explicit override.
UPDATE blessboard.branches b
   SET service_times_mode = 'override'
 WHERE b.service_times_mode IS NULL
   AND EXISTS (
     SELECT 1
       FROM blessboard.public_pages p
       JOIN blessboard.page_sections s ON s.page_id = p.id
      WHERE p.church_id = b.church_id
        AND p.branch_id = b.id
        AND s.section_key = 'service_times'
        AND s.section_type = 'service_times'
        AND (
          COALESCE(jsonb_array_length(s.layout_metadata->'entries'), 0) > 0
          OR NULLIF(trim(s.body_text), '') IS NOT NULL
        )
   );
