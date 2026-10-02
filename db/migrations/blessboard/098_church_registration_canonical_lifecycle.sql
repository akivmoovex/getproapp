-- Canonical platform registration lifecycle values for NEW church applications.
-- Legacy duplicate_review / closed application_status rows remain valid.
-- The legacy status column remains pending/contacted/closed (schema constraint).
-- Does not rewrite historical application rows.

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_application_status_check;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_application_status_check
    CHECK (application_status IN (
      'submitted',
      'provisioning',
      'review_required',
      'active',
      'rejected',
      'cancelled',
      'suspended',
      'provision_failed',
      'duplicate_review',
      'closed'
    ));

COMMENT ON COLUMN blessboard.platform_church_registration_applications.application_status IS
  'Canonical: submitted, provisioning, review_required, active, rejected, suspended, provision_failed. Legacy: duplicate_review, closed, cancelled.';
