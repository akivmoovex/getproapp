-- ActiveClinic clinic-registration review lifecycle (V7 Phase B).
-- Follow-up is a separate axis from application status.
-- Does not add information_requested to application status.
-- Does not send email/SMS.

ALTER TABLE activeclinic.clinic_registration_applications
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS information_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS information_requested_by_id UUID NULL,
  ADD COLUMN IF NOT EXISTS information_returned_at TIMESTAMPTZ NULL;

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_follow_up_status_check;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_follow_up_status_check
  CHECK (follow_up_status IN (
    'none',
    'under_review',
    'awaiting_customer',
    'returned_for_review'
  ));

ALTER TABLE activeclinic.clinic_registration_applications
  DROP CONSTRAINT IF EXISTS clinic_registration_applications_rejection_reason_len;

ALTER TABLE activeclinic.clinic_registration_applications
  ADD CONSTRAINT clinic_registration_applications_rejection_reason_len
  CHECK (
    rejection_reason IS NULL
    OR char_length(btrim(rejection_reason)) BETWEEN 3 AND 2000
  );

CREATE INDEX IF NOT EXISTS clinic_registration_applications_follow_up_idx
  ON activeclinic.clinic_registration_applications (follow_up_status, created_at DESC);

COMMENT ON COLUMN activeclinic.clinic_registration_applications.follow_up_status IS
  'Operator follow-up axis. Independent of application status (pending_review|approved|rejected|withdrawn|duplicate).';

COMMENT ON COLUMN activeclinic.clinic_registration_applications.rejection_reason IS
  'Internal structured rejection reason. Never treated as an outbound message unless a real provider sends it.';

-- Append-only review history (notes, information requests, decisions, provisioning).
-- Used for unprovisioned applications where platform.audit_events requires organization_id.
CREATE TABLE IF NOT EXISTS activeclinic.clinic_registration_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES activeclinic.clinic_registration_applications (id)
    ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal',
  body TEXT NULL,
  actor_id UUID NULL,
  delivery_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinic_reg_review_events_type_check
    CHECK (event_type IN (
      'submitted',
      'review_started',
      'information_requested',
      'information_returned',
      'note',
      'approval',
      'rejection',
      'provisioning_started',
      'provisioning_succeeded',
      'provisioning_failed',
      'follow_up_updated'
    )),
  CONSTRAINT clinic_reg_review_events_visibility_check
    CHECK (visibility IN ('internal', 'history')),
  CONSTRAINT clinic_reg_review_events_note_internal
    CHECK (event_type <> 'note' OR visibility = 'internal'),
  CONSTRAINT clinic_reg_review_events_body_len
    CHECK (
      body IS NULL
      OR char_length(btrim(body)) BETWEEN 1 AND 8000
    ),
  CONSTRAINT clinic_reg_review_events_delivery_status_check
    CHECK (
      delivery_status IS NULL
      OR delivery_status IN (
        'not_applicable',
        'recorded',
        'sending_unavailable',
        'queued',
        'sent',
        'failed'
      )
    )
);

CREATE INDEX IF NOT EXISTS clinic_reg_review_events_application_created_idx
  ON activeclinic.clinic_registration_review_events (
    application_id,
    created_at ASC,
    id ASC
  );

COMMENT ON TABLE activeclinic.clinic_registration_review_events IS
  'Append-only clinic registration review history. Internal notes never leave Platform Admin.';
