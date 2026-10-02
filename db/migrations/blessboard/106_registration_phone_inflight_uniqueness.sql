-- Allow same-identity multi-org registration retries: phone uniqueness no longer
-- spans every historical application row. Enforce uniqueness only for in-flight
-- applications; completed/provisioned rows are gated in application code so the
-- same email may reuse a phone while a different email cannot.

DROP INDEX IF EXISTS blessboard.platform_church_reg_apps_phone_normalized_active_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS platform_church_reg_apps_phone_inflight_uidx
  ON blessboard.platform_church_registration_applications (contact_phone_normalized)
  WHERE contact_phone_normalized IS NOT NULL
    AND (
      application_status IN (
        'submitted',
        'duplicate_review',
        'review_required',
        'provisioning'
      )
      OR provisioning_status IN ('provisioning', 'provisioning_failed')
    );

COMMENT ON INDEX blessboard.platform_church_reg_apps_phone_inflight_uidx IS
  'In-flight church registration phone uniqueness. Provisioned/active reuse is enforced in application code (same email allowed; different email blocked).';
