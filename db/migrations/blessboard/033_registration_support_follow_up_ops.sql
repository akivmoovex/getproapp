-- Customer support follow-up ops (Prompt 26).
-- Extends application-level ownership/dates for unprovisioned Network/enquiry cases,
-- allows application-scoped contact notes, and maps workflow follow-up vocabulary.
-- Does not create a CRM/ticketing schema.

-- ---------------------------------------------------------------------------
-- A. Application-level support owner + contact dates (mirror onboarding)
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS assigned_support_user_id UUID NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_assigned_support_user_fkey'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_assigned_support_user_fkey
      FOREIGN KEY (assigned_support_user_id)
      REFERENCES blessboard.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_last_contacted_after_first;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_last_contacted_after_first
    CHECK (
      last_contacted_at IS NULL
      OR first_contacted_at IS NULL
      OR last_contacted_at >= first_contacted_at
    );

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_assigned_support_user_idx
  ON blessboard.platform_church_registration_applications (assigned_support_user_id)
  WHERE assigned_support_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_next_follow_up_idx
  ON blessboard.platform_church_registration_applications (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- B. Follow-up vocabulary: add Prompt 26 workflow labels (keep legacy values)
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_follow_up_status_check;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_follow_up_status_check
  CHECK (
    follow_up_status IS NULL
    OR follow_up_status IN (
      'new',
      'contact_pending',
      'call_pending',
      'contacted',
      'awaiting_customer',
      'qualified',
      'needs_help',
      'self_onboarding',
      'completed',
      'unreachable',
      'not_interested'
    )
  );

ALTER TABLE blessboard.organization_onboarding
  DROP CONSTRAINT IF EXISTS organization_onboarding_follow_up_status_check;
ALTER TABLE blessboard.organization_onboarding
  ADD CONSTRAINT organization_onboarding_follow_up_status_check
  CHECK (
    follow_up_status IN (
      'new',
      'contact_pending',
      'call_pending',
      'contacted',
      'awaiting_customer',
      'qualified',
      'needs_help',
      'self_onboarding',
      'completed',
      'unreachable',
      'not_interested'
    )
  );

-- Network / support enquiries previously stored as follow_up_status=new → contact_pending.
UPDATE blessboard.platform_church_registration_applications
   SET follow_up_status = 'contact_pending',
       updated_at = updated_at
 WHERE support_requested = TRUE
   AND selected_plan = 'network'
   AND follow_up_status = 'new'
   AND organization_id IS NULL
   AND provisioning_status = 'not_started';

-- ---------------------------------------------------------------------------
-- C. Application-scoped support contacts (organization optional)
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.organization_support_contacts
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE blessboard.organization_support_contacts
  DROP CONSTRAINT IF EXISTS organization_support_contacts_scope_check;
ALTER TABLE blessboard.organization_support_contacts
  ADD CONSTRAINT organization_support_contacts_scope_check
    CHECK (
      organization_id IS NOT NULL
      OR registration_application_id IS NOT NULL
    );
