-- Phase3 HQ website change submission + review workflow.
-- Branch submission UI is out of scope; HQ list/review routes consume this storage.

CREATE TABLE IF NOT EXISTS blessboard.website_change_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  page_key TEXT NOT NULL,
  section_key TEXT NULL,
  change_type TEXT NOT NULL,
  current_content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NULL,
  submitter_note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  submitted_by UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  reviewer_comment TEXT NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wcs_title_len
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT wcs_page_key_format
    CHECK (page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT wcs_section_key_format
    CHECK (
      section_key IS NULL
      OR section_key ~ '^[a-z][a-z0-9_-]{0,63}$'
    ),
  CONSTRAINT wcs_change_type_len
    CHECK (char_length(btrim(change_type)) BETWEEN 1 AND 80),
  CONSTRAINT wcs_current_content_object
    CHECK (jsonb_typeof(current_content_json) = 'object'),
  CONSTRAINT wcs_proposed_content_object
    CHECK (jsonb_typeof(proposed_content_json) = 'object'),
  CONSTRAINT wcs_reason_len
    CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 2000),
  CONSTRAINT wcs_submitter_note_len
    CHECK (
      submitter_note IS NULL
      OR char_length(btrim(submitter_note)) BETWEEN 1 AND 2000
    ),
  CONSTRAINT wcs_status_check
    CHECK (status IN (
      'pending_review',
      'changes_requested',
      'approved',
      'rejected',
      'published',
      'withdrawn'
    )),
  CONSTRAINT wcs_reviewer_comment_len
    CHECK (
      reviewer_comment IS NULL
      OR char_length(btrim(reviewer_comment)) BETWEEN 1 AND 2000
    ),
  CONSTRAINT wcs_rejection_reason_len
    CHECK (
      rejection_reason IS NULL
      OR char_length(btrim(rejection_reason)) BETWEEN 1 AND 2000
    ),
  CONSTRAINT wcs_review_consistency
    CHECK (
      (
        reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND reviewer_comment IS NULL
        AND rejection_reason IS NULL
      )
      OR (
        reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    ),
  CONSTRAINT wcs_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS wcs_organization_status_idx
  ON blessboard.website_change_submissions (organization_id, status);

CREATE INDEX IF NOT EXISTS wcs_organization_submitted_at_idx
  ON blessboard.website_change_submissions (organization_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS wcs_organization_branch_idx
  ON blessboard.website_change_submissions (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS wcs_organization_page_key_idx
  ON blessboard.website_change_submissions (organization_id, page_key);

CREATE OR REPLACE FUNCTION blessboard.validate_website_change_submission_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  branch_church UUID;
  org_church_org UUID;
BEGIN
  SELECT b.church_id INTO branch_church
    FROM blessboard.branches b
   WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL THEN
    RAISE EXCEPTION 'blessboard.website_change_submissions.branch_id is invalid'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT c.organization_id INTO org_church_org
    FROM blessboard.churches c
   WHERE c.id = branch_church;
  IF org_church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.website_change_submissions branch/organization mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_change_submissions_scope_ok
  ON blessboard.website_change_submissions;
CREATE TRIGGER website_change_submissions_scope_ok
  BEFORE INSERT OR UPDATE OF organization_id, branch_id
  ON blessboard.website_change_submissions
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_website_change_submission_scope();

CREATE TABLE IF NOT EXISTS blessboard.website_change_submission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL
    REFERENCES blessboard.website_change_submissions (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  comment TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wcs_events_type_check
    CHECK (event_type IN (
      'created',
      'submitted',
      'reviewed',
      'changes_requested',
      'resubmitted',
      'approved',
      'rejected',
      'published'
    )),
  CONSTRAINT wcs_events_comment_len
    CHECK (comment IS NULL OR char_length(btrim(comment)) BETWEEN 1 AND 2000),
  CONSTRAINT wcs_events_metadata_object
    CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS wcs_events_submission_created_idx
  ON blessboard.website_change_submission_events (submission_id, created_at ASC);

CREATE INDEX IF NOT EXISTS wcs_events_organization_idx
  ON blessboard.website_change_submission_events (organization_id);
