-- Network support validation statuses + optional structured checklist.
-- Approval for provisioning does not activate Network entitlements.

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
        'validation_pending',
        'validation_in_progress',
        'qualified',
        'approved_for_provision',
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
        'validation_pending',
        'validation_in_progress',
        'qualified',
        'approved_for_provision',
        'needs_help',
        'self_onboarding',
        'completed',
        'unreachable',
        'not_interested'
      )
    );

-- Structured Network validation checklist (keys only; never passwords).
ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS network_validation_checklist JSONB NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_network_checklist_object;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_network_checklist_object
    CHECK (
      network_validation_checklist IS NULL
      OR jsonb_typeof(network_validation_checklist) = 'object'
    );

COMMENT ON COLUMN blessboard.platform_church_registration_applications.network_validation_checklist IS
  'Structured Network support validation checklist. Never store passwords or secrets.';
