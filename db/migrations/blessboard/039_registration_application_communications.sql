-- Registration application communications ledger + rejection metadata (Phase2 Prompt 062).
-- Append-only communications. Does not change reject routes, send email, or alter status.

-- ---------------------------------------------------------------------------
-- A. Rejection metadata on applications (nullable; existing rejection_reason preserved)
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS rejection_category TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS reapplication_allowed BOOLEAN NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS rejection_notification_status TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_rejection_category_len'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_rejection_category_len
      CHECK (
        rejection_category IS NULL
        OR char_length(btrim(rejection_category)) BETWEEN 1 AND 80
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_rejection_notification_status_check'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_rejection_notification_status_check
      CHECK (
        rejection_notification_status IS NULL
        OR rejection_notification_status IN (
          'recorded',
          'sending_unavailable',
          'queued',
          'sent',
          'failed'
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. Append-only communications ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.registration_application_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE RESTRICT,
  communication_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  recipient TEXT NULL,
  subject TEXT NULL,
  applicant_message TEXT NULL,
  internal_note TEXT NULL,
  request_category TEXT NULL,
  requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_due_at TIMESTAMPTZ NULL,
  delivery_status TEXT NOT NULL,
  delivery_error_code TEXT NULL,
  created_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reg_app_comms_type_check
    CHECK (communication_type IN (
      'internal_note',
      'information_request',
      'applicant_message',
      'rejection_notice',
      'applicant_response',
      'system_event'
    )),
  CONSTRAINT reg_app_comms_channel_check
    CHECK (channel IN (
      'internal',
      'email',
      'phone',
      'other'
    )),
  CONSTRAINT reg_app_comms_direction_check
    CHECK (direction IN (
      'internal',
      'outbound',
      'inbound'
    )),
  CONSTRAINT reg_app_comms_delivery_status_check
    CHECK (delivery_status IN (
      'not_applicable',
      'recorded',
      'sending_unavailable',
      'queued',
      'sent',
      'failed'
    )),
  CONSTRAINT reg_app_comms_requested_fields_is_array
    CHECK (jsonb_typeof(requested_fields) = 'array'),
  CONSTRAINT reg_app_comms_requested_documents_is_array
    CHECK (jsonb_typeof(requested_documents) = 'array'),
  CONSTRAINT reg_app_comms_recipient_len
    CHECK (
      recipient IS NULL
      OR char_length(btrim(recipient)) BETWEEN 1 AND 320
    ),
  CONSTRAINT reg_app_comms_subject_len
    CHECK (
      subject IS NULL
      OR char_length(btrim(subject)) BETWEEN 1 AND 200
    ),
  CONSTRAINT reg_app_comms_applicant_message_len
    CHECK (
      applicant_message IS NULL
      OR char_length(btrim(applicant_message)) BETWEEN 1 AND 8000
    ),
  CONSTRAINT reg_app_comms_internal_note_len
    CHECK (
      internal_note IS NULL
      OR char_length(btrim(internal_note)) BETWEEN 1 AND 8000
    ),
  CONSTRAINT reg_app_comms_request_category_len
    CHECK (
      request_category IS NULL
      OR char_length(btrim(request_category)) BETWEEN 1 AND 80
    ),
  CONSTRAINT reg_app_comms_delivery_error_code_len
    CHECK (
      delivery_error_code IS NULL
      OR char_length(btrim(delivery_error_code)) BETWEEN 1 AND 120
    ),
  CONSTRAINT reg_app_comms_internal_note_consistency
    CHECK (
      communication_type <> 'internal_note'
      OR (
        direction = 'internal'
        AND delivery_status = 'not_applicable'
      )
    ),
  CONSTRAINT reg_app_comms_information_request_message
    CHECK (
      communication_type <> 'information_request'
      OR (
        applicant_message IS NOT NULL
        AND char_length(btrim(applicant_message)) BETWEEN 1 AND 8000
      )
    ),
  CONSTRAINT reg_app_comms_rejection_notice_message
    CHECK (
      communication_type <> 'rejection_notice'
      OR (
        applicant_message IS NOT NULL
        AND char_length(btrim(applicant_message)) BETWEEN 1 AND 8000
      )
    ),
  CONSTRAINT reg_app_comms_outbound_applicant_message
    CHECK (
      NOT (
        communication_type = 'applicant_message'
        AND direction = 'outbound'
      )
      OR (
        applicant_message IS NOT NULL
        AND char_length(btrim(applicant_message)) BETWEEN 1 AND 8000
      )
    ),
  CONSTRAINT reg_app_comms_failed_error_code
    CHECK (
      delivery_status = 'failed'
      OR delivery_error_code IS NULL
    )
);

CREATE INDEX IF NOT EXISTS reg_app_comms_application_created_idx
  ON blessboard.registration_application_communications (
    application_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS reg_app_comms_application_type_created_idx
  ON blessboard.registration_application_communications (
    application_id,
    communication_type,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS reg_app_comms_response_due_idx
  ON blessboard.registration_application_communications (
    response_due_at
  )
  WHERE response_due_at IS NOT NULL;
