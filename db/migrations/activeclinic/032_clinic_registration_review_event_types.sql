-- Expand clinic registration review event types for V7 lifecycle audit completeness.
-- review_required: exceptional hold before an organization exists.
-- provisioning_retry: idempotent resume after a recorded provision failure.

ALTER TABLE activeclinic.clinic_registration_review_events
  DROP CONSTRAINT IF EXISTS clinic_reg_review_events_type_check;

ALTER TABLE activeclinic.clinic_registration_review_events
  ADD CONSTRAINT clinic_reg_review_events_type_check
    CHECK (event_type IN (
      'submitted',
      'review_started',
      'review_required',
      'information_requested',
      'information_returned',
      'note',
      'approval',
      'rejection',
      'provisioning_started',
      'provisioning_retry',
      'provisioning_succeeded',
      'provisioning_failed',
      'follow_up_updated'
    ));
