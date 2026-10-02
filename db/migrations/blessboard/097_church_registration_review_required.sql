-- Canonical platform registration hold status for church applications.
-- Maps the shared lifecycle value review_required onto BlessBoard storage.
-- Legacy duplicate_review rows remain valid and continue to mean review_required.

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_application_status_check;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_application_status_check
    CHECK (application_status IN (
      'submitted',
      'duplicate_review',
      'review_required',
      'rejected',
      'cancelled',
      'closed'
    ));
