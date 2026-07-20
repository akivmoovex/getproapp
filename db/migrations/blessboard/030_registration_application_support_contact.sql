-- Application-level support-contact flags for Network (and other enquiry) registrations
-- that are not yet linked to an organization. Reuses the same follow_up_status vocabulary
-- as blessboard.organization_onboarding. Does not create tenants or subscriptions.

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS support_requested BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_follow_up_status_check'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_follow_up_status_check
      CHECK (
        follow_up_status IS NULL
        OR follow_up_status IN (
          'new',
          'call_pending',
          'contacted',
          'needs_help',
          'self_onboarding',
          'completed',
          'unreachable',
          'not_interested'
        )
      );
  END IF;
END $$;

-- Network / support-contact queue lookups (partial + plan index; bounded list filters).
CREATE INDEX IF NOT EXISTS platform_church_reg_apps_support_requested_idx
  ON blessboard.platform_church_registration_applications (created_at DESC)
  WHERE support_requested = TRUE;

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_selected_plan_created_idx
  ON blessboard.platform_church_registration_applications (selected_plan, created_at DESC);
