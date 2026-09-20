-- Additive V8 BlessBoard membership workflow (BB01–BB08, BB11–BB18).
-- Extends member_registrations; adds intake forms, review audit, pastoral notes, branch transfers.
-- Backward-compatible. Does not create login accounts. Idempotent. Not applied overnight on hosted DB.

-- ---------------------------------------------------------------------------
-- Membership intake forms (church admin publish — BB01/BB02)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.membership_intake_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  form_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  enable_spiritual_background BOOLEAN NOT NULL DEFAULT true,
  enable_participation_interests BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  updated_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT membership_intake_forms_key_format
    CHECK (form_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT membership_intake_forms_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT membership_intake_forms_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  CONSTRAINT membership_intake_forms_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT membership_intake_forms_published_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT membership_intake_forms_church_key_unique
    UNIQUE (church_id, form_key)
);

CREATE INDEX IF NOT EXISTS membership_intake_forms_church_status_idx
  ON blessboard.membership_intake_forms (church_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS membership_intake_forms_branch_owns_church
  ON blessboard.membership_intake_forms;
CREATE TRIGGER membership_intake_forms_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id
  ON blessboard.membership_intake_forms
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

-- ---------------------------------------------------------------------------
-- Registration application payload + needs_follow_up + pastoral notes
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.member_registrations
  ADD COLUMN IF NOT EXISTS intake_form_id UUID NULL
    REFERENCES blessboard.membership_intake_forms (id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pastoral_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS pastoral_notes_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pastoral_notes_updated_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL;

ALTER TABLE blessboard.member_registrations
  DROP CONSTRAINT IF EXISTS member_registrations_status_check;

ALTER TABLE blessboard.member_registrations
  ADD CONSTRAINT member_registrations_status_check
  CHECK (status IN (
    'submitted', 'under_review', 'needs_follow_up', 'approved', 'rejected', 'withdrawn'
  ));

ALTER TABLE blessboard.member_registrations
  DROP CONSTRAINT IF EXISTS member_registrations_review_consistency;

ALTER TABLE blessboard.member_registrations
  ADD CONSTRAINT member_registrations_review_consistency
  CHECK (
    (status IN ('submitted', 'withdrawn')
      AND reviewed_at IS NULL
      AND reviewed_by_user_id IS NULL
      AND member_id IS NULL)
    OR (status IN ('under_review', 'needs_follow_up') AND member_id IS NULL)
    OR (status = 'rejected'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND member_id IS NULL)
    OR (status = 'approved'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND member_id IS NOT NULL)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'member_registrations_pastoral_notes_len'
  ) THEN
    ALTER TABLE blessboard.member_registrations
      ADD CONSTRAINT member_registrations_pastoral_notes_len
      CHECK (pastoral_notes IS NULL OR char_length(pastoral_notes) BETWEEN 1 AND 5000);
  END IF;
END $$;

-- Open unique indexes should treat needs_follow_up as open
DROP INDEX IF EXISTS blessboard.member_registrations_church_email_open_uidx;
CREATE UNIQUE INDEX member_registrations_church_email_open_uidx
  ON blessboard.member_registrations (church_id, email_normalized)
  WHERE email_normalized IS NOT NULL
    AND status IN ('submitted', 'under_review', 'needs_follow_up');

DROP INDEX IF EXISTS blessboard.member_registrations_church_phone_open_uidx;
CREATE UNIQUE INDEX member_registrations_church_phone_open_uidx
  ON blessboard.member_registrations (church_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND status IN ('submitted', 'under_review', 'needs_follow_up');

-- ---------------------------------------------------------------------------
-- Separate review decision audit history (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_registration_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL
    REFERENCES blessboard.member_registrations (id)
    ON DELETE CASCADE,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  decision_code TEXT NOT NULL,
  decision_summary TEXT NULL,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_registration_review_events_decision_check
    CHECK (decision_code IN (
      'submitted', 'under_review', 'needs_follow_up', 'approved', 'rejected', 'withdrawn', 'note'
    )),
  CONSTRAINT member_registration_review_events_summary_len
    CHECK (decision_summary IS NULL OR char_length(decision_summary) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS member_registration_review_events_reg_idx
  ON blessboard.member_registration_review_events (registration_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.prevent_member_registration_review_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'blessboard.member_registration_review_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS member_registration_review_events_no_update
  ON blessboard.member_registration_review_events;
CREATE TRIGGER member_registration_review_events_no_update
  BEFORE UPDATE ON blessboard.member_registration_review_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_member_registration_review_events_mutation();

DROP TRIGGER IF EXISTS member_registration_review_events_no_delete
  ON blessboard.member_registration_review_events;
CREATE TRIGGER member_registration_review_events_no_delete
  BEFORE DELETE ON blessboard.member_registration_review_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_member_registration_review_events_mutation();

-- ---------------------------------------------------------------------------
-- Branch transfer requests (BB16)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_branch_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  from_branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  to_branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'requested',
  reason TEXT NULL,
  reviewer_notes TEXT NULL,
  requested_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  reviewed_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_branch_transfer_requests_status_check
    CHECK (status IN ('requested', 'approved', 'declined', 'cancelled')),
  CONSTRAINT member_branch_transfer_requests_branches_distinct
    CHECK (from_branch_id IS DISTINCT FROM to_branch_id),
  CONSTRAINT member_branch_transfer_requests_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  CONSTRAINT member_branch_transfer_requests_notes_len
    CHECK (reviewer_notes IS NULL OR char_length(reviewer_notes) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS member_branch_transfer_requests_church_status_idx
  ON blessboard.member_branch_transfer_requests (church_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS member_branch_transfer_requests_member_idx
  ON blessboard.member_branch_transfer_requests (member_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS member_branch_transfer_requests_open_uidx
  ON blessboard.member_branch_transfer_requests (member_id)
  WHERE status = 'requested';
