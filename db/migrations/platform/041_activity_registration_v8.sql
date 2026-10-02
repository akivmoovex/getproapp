-- Additive V8 activity registration links for BlessBoard visitor / event / ministry
-- forms (BB08–BB10). Extends shared tenant forms. Idempotent. Not applied overnight.

-- ---------------------------------------------------------------------------
-- Categories: visitor + ministry (event already allowed)
-- ---------------------------------------------------------------------------

ALTER TABLE platform.tenant_forms
  DROP CONSTRAINT IF EXISTS tenant_forms_category_check;

ALTER TABLE platform.tenant_forms
  ADD CONSTRAINT tenant_forms_category_check
  CHECK (category IN (
    'general', 'feedback', 'registration', 'event', 'survey', 'visitor', 'ministry'
  ));

-- ---------------------------------------------------------------------------
-- Link to BlessBoard event/ministry + capacity/closure controls
-- ---------------------------------------------------------------------------

ALTER TABLE platform.tenant_forms
  ADD COLUMN IF NOT EXISTS linked_resource_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS linked_resource_id UUID NULL,
  ADD COLUMN IF NOT EXISTS registration_closed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_submissions INT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_forms_linked_resource_type_check'
  ) THEN
    ALTER TABLE platform.tenant_forms
      ADD CONSTRAINT tenant_forms_linked_resource_type_check
      CHECK (
        linked_resource_type IS NULL
        OR linked_resource_type IN ('event', 'ministry', 'visitor')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_forms_linked_resource_pair_check'
  ) THEN
    ALTER TABLE platform.tenant_forms
      ADD CONSTRAINT tenant_forms_linked_resource_pair_check
      CHECK (
        (linked_resource_type IS NULL AND linked_resource_id IS NULL)
        OR (linked_resource_type IS NOT NULL AND linked_resource_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_forms_max_submissions_check'
  ) THEN
    ALTER TABLE platform.tenant_forms
      ADD CONSTRAINT tenant_forms_max_submissions_check
      CHECK (max_submissions IS NULL OR max_submissions >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenant_forms_linked_resource_idx
  ON platform.tenant_forms (product_code, linked_resource_type, linked_resource_id)
  WHERE linked_resource_id IS NOT NULL;

-- Prevent duplicate open registrations by email per form (communication identity).
CREATE UNIQUE INDEX IF NOT EXISTS tenant_form_submissions_open_email_uidx
  ON platform.tenant_form_submissions (form_id, lower(submitter_email))
  WHERE submitter_email IS NOT NULL
    AND review_status IN ('submitted', 'in_review', 'accepted');
