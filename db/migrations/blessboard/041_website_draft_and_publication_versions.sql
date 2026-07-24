-- Phase3 branch submission drafts + HQ website publication version history.
-- Additive only; does not rewrite migration 040.

-- Allow draft submissions (branch save-before-submit).
ALTER TABLE blessboard.website_change_submissions
  DROP CONSTRAINT IF EXISTS wcs_status_check;

ALTER TABLE blessboard.website_change_submissions
  ADD CONSTRAINT wcs_status_check
  CHECK (status IN (
    'draft',
    'pending_review',
    'changes_requested',
    'approved',
    'rejected',
    'published',
    'withdrawn'
  ));

ALTER TABLE blessboard.website_change_submissions
  ALTER COLUMN status SET DEFAULT 'draft';

-- Drafts may not yet have a submission timestamp.
ALTER TABLE blessboard.website_change_submissions
  ALTER COLUMN submitted_at DROP NOT NULL;

-- Informational submission metadata (does not schedule publication).
ALTER TABLE blessboard.website_change_submissions
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE blessboard.website_change_submissions
  DROP CONSTRAINT IF EXISTS wcs_priority_check;

ALTER TABLE blessboard.website_change_submissions
  ADD CONSTRAINT wcs_priority_check
  CHECK (priority IN ('normal', 'important', 'urgent'));

ALTER TABLE blessboard.website_change_submissions
  ADD COLUMN IF NOT EXISTS requested_publication_date DATE NULL;

ALTER TABLE blessboard.website_change_submissions
  ADD COLUMN IF NOT EXISTS checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE blessboard.website_change_submissions
  DROP CONSTRAINT IF EXISTS wcs_checklist_object;

ALTER TABLE blessboard.website_change_submissions
  ADD CONSTRAINT wcs_checklist_object
  CHECK (jsonb_typeof(checklist_json) = 'object');

-- Timeline: withdrawn events for branch withdrawal.
ALTER TABLE blessboard.website_change_submission_events
  DROP CONSTRAINT IF EXISTS wcs_events_type_check;

ALTER TABLE blessboard.website_change_submission_events
  ADD CONSTRAINT wcs_events_type_check
  CHECK (event_type IN (
    'created',
    'submitted',
    'reviewed',
    'changes_requested',
    'resubmitted',
    'approved',
    'rejected',
    'published',
    'withdrawn'
  ));

-- Website publication version snapshots (created by canonical publish service).
CREATE TABLE IF NOT EXISTS blessboard.website_publication_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  theme_key TEXT NULL,
  source_type TEXT NOT NULL DEFAULT 'hq_edit',
  source_submission_id UUID NULL
    REFERENCES blessboard.website_change_submissions (id)
    ON DELETE RESTRICT,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NULL,
  superseded_at TIMESTAMPTZ NULL,
  CONSTRAINT wpv_version_positive
    CHECK (version_number >= 1),
  CONSTRAINT wpv_org_version_unique
    UNIQUE (organization_id, version_number),
  CONSTRAINT wpv_status_check
    CHECK (status IN ('draft', 'published', 'superseded', 'restored', 'archived')),
  CONSTRAINT wpv_source_type_check
    CHECK (source_type IN (
      'hq_edit',
      'branch_submission',
      'theme_change',
      'content_restoration',
      'initial_setup'
    )),
  CONSTRAINT wpv_theme_key_len
    CHECK (theme_key IS NULL OR char_length(btrim(theme_key)) BETWEEN 1 AND 80),
  CONSTRAINT wpv_snapshot_object
    CHECK (jsonb_typeof(snapshot_json) = 'object'),
  CONSTRAINT wpv_change_summary_object
    CHECK (jsonb_typeof(change_summary_json) = 'object'),
  CONSTRAINT wpv_published_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    )
);

CREATE INDEX IF NOT EXISTS wpv_organization_status_idx
  ON blessboard.website_publication_versions (organization_id, status);

CREATE INDEX IF NOT EXISTS wpv_organization_published_at_idx
  ON blessboard.website_publication_versions (organization_id, published_at DESC NULLS LAST);

-- At most one live published version per organization.
CREATE UNIQUE INDEX IF NOT EXISTS wpv_one_published_per_org
  ON blessboard.website_publication_versions (organization_id)
  WHERE status = 'published';

CREATE OR REPLACE FUNCTION blessboard.validate_website_publication_version_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
BEGIN
  SELECT c.organization_id INTO church_org
    FROM blessboard.churches c
   WHERE c.id = NEW.church_id;
  IF church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.website_publication_versions church/organization mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_publication_versions_scope_ok
  ON blessboard.website_publication_versions;
CREATE TRIGGER website_publication_versions_scope_ok
  BEFORE INSERT OR UPDATE OF organization_id, church_id
  ON blessboard.website_publication_versions
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_website_publication_version_scope();
