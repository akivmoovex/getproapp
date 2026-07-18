-- BlessBoard V5 resources, forms, form submissions, and member requests.
-- Controlled form schemas only (validated in app). Private media via media_assets.
-- Soft status lifecycles; no hard deletes for requests (status closed).

-- ---------------------------------------------------------------------------
-- Resources (member/admin library items)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NULL,
  media_asset_id UUID NULL
    REFERENCES blessboard.media_assets (id)
    ON DELETE RESTRICT,
  audience TEXT NOT NULL DEFAULT 'members',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resources_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT resources_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 5000),
  CONSTRAINT resources_audience_check
    CHECK (audience IN ('members', 'admins', 'all')),
  CONSTRAINT resources_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT resources_published_at_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT resources_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS resources_church_status_idx
  ON blessboard.resources (church_id, status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS resources_church_branch_status_idx
  ON blessboard.resources (church_id, branch_id, status)
  WHERE branch_id IS NOT NULL;

DROP TRIGGER IF EXISTS resources_branch_owns_church ON blessboard.resources;
CREATE TRIGGER resources_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.resources
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS resources_publish_requires_active ON blessboard.resources;
CREATE TRIGGER resources_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.resources
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS resources_no_archive_reactivation ON blessboard.resources;
CREATE TRIGGER resources_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.resources
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();

CREATE OR REPLACE FUNCTION blessboard.require_resource_media_same_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  media_church UUID;
  media_status TEXT;
BEGIN
  IF NEW.media_asset_id IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  SELECT m.church_id, m.status INTO media_church, media_status
    FROM blessboard.media_assets m
   WHERE m.id = NEW.media_asset_id;
  IF media_church IS NULL THEN
    RAISE EXCEPTION 'media asset % not found', NEW.media_asset_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF media_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'resource media must belong to same church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF media_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'resource media must be active'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resources_media_same_church ON blessboard.resources;
CREATE TRIGGER resources_media_same_church
  BEFORE INSERT OR UPDATE OF church_id, media_asset_id ON blessboard.resources
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_resource_media_same_church();

-- ---------------------------------------------------------------------------
-- Forms (controlled schema_json — app validates allowlisted field types)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NULL,
  schema_json JSONB NOT NULL DEFAULT '{"version":1,"fields":[]}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forms_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT forms_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 5000),
  CONSTRAINT forms_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT forms_schema_is_object
    CHECK (jsonb_typeof(schema_json) = 'object'),
  CONSTRAINT forms_schema_size
    CHECK (pg_column_size(schema_json) <= 32768),
  CONSTRAINT forms_published_at_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT forms_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS forms_church_status_idx
  ON blessboard.forms (church_id, status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS forms_church_branch_status_idx
  ON blessboard.forms (church_id, branch_id, status)
  WHERE branch_id IS NOT NULL;

DROP TRIGGER IF EXISTS forms_branch_owns_church ON blessboard.forms;
CREATE TRIGGER forms_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.forms
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

DROP TRIGGER IF EXISTS forms_publish_requires_active ON blessboard.forms;
CREATE TRIGGER forms_publish_requires_active
  BEFORE INSERT OR UPDATE OF status, church_id, branch_id ON blessboard.forms
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_active_scope_for_published_content();

DROP TRIGGER IF EXISTS forms_no_archive_reactivation ON blessboard.forms;
CREATE TRIGGER forms_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.forms
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_content_archive_reactivation();

-- ---------------------------------------------------------------------------
-- Form submissions (member-owned answers; no executable payload)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  form_id UUID NOT NULL
    REFERENCES blessboard.forms (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_submissions_status_check
    CHECK (status IN ('submitted', 'archived')),
  CONSTRAINT form_submissions_answers_is_object
    CHECK (jsonb_typeof(answers_json) = 'object'),
  CONSTRAINT form_submissions_answers_size
    CHECK (pg_column_size(answers_json) <= 65536),
  CONSTRAINT form_submissions_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS form_submissions_form_submitted_idx
  ON blessboard.form_submissions (form_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS form_submissions_member_idx
  ON blessboard.form_submissions (member_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS form_submissions_church_branch_idx
  ON blessboard.form_submissions (church_id, branch_id, submitted_at DESC);

DROP TRIGGER IF EXISTS form_submissions_branch_owns_church ON blessboard.form_submissions;
CREATE TRIGGER form_submissions_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.require_form_submission_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  form_church UUID;
  form_status TEXT;
  member_church UUID;
BEGIN
  SELECT f.church_id, f.status INTO form_church, form_status
    FROM blessboard.forms f
   WHERE f.id = NEW.form_id;
  IF form_church IS NULL THEN
    RAISE EXCEPTION 'form % not found', NEW.form_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF form_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'form submission must match form church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'INSERT' AND form_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'form must be published to accept submissions'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'form submission member must belong to church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_submissions_scope ON blessboard.form_submissions;
CREATE TRIGGER form_submissions_scope
  BEFORE INSERT OR UPDATE OF church_id, form_id, member_id
  ON blessboard.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_form_submission_scope();

-- ---------------------------------------------------------------------------
-- Member requests + member-visible status history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  media_asset_id UUID NULL
    REFERENCES blessboard.media_assets (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_requests_category_check
    CHECK (category IN ('prayer', 'pastoral', 'practical', 'other')),
  CONSTRAINT member_requests_subject_len
    CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT member_requests_message_len
    CHECK (char_length(message) BETWEEN 1 AND 5000),
  CONSTRAINT member_requests_status_check
    CHECK (status IN ('submitted', 'in_review', 'resolved', 'closed')),
  CONSTRAINT member_requests_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS member_requests_branch_status_idx
  ON blessboard.member_requests (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS member_requests_member_idx
  ON blessboard.member_requests (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_requests_church_status_idx
  ON blessboard.member_requests (church_id, status, created_at DESC);

DROP TRIGGER IF EXISTS member_requests_branch_owns_church ON blessboard.member_requests;
CREATE TRIGGER member_requests_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.member_requests
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.require_member_request_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_church UUID;
  media_church UUID;
  media_vis TEXT;
  media_status TEXT;
BEGIN
  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'member request member must belong to church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.media_asset_id IS NOT NULL THEN
    SELECT m.church_id, m.visibility, m.status
      INTO media_church, media_vis, media_status
      FROM blessboard.media_assets m
     WHERE m.id = NEW.media_asset_id;
    IF media_church IS NULL THEN
      RAISE EXCEPTION 'media asset % not found', NEW.media_asset_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF media_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'request media must belong to same church'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF media_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'request media must be active'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF media_vis IS DISTINCT FROM 'private' THEN
      RAISE EXCEPTION 'request attachments must be private media'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_requests_scope ON blessboard.member_requests;
CREATE TRIGGER member_requests_scope
  BEFORE INSERT OR UPDATE OF church_id, member_id, media_asset_id
  ON blessboard.member_requests
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_member_request_scope();

CREATE TABLE IF NOT EXISTS blessboard.member_request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  request_id UUID NOT NULL
    REFERENCES blessboard.member_requests (id)
    ON DELETE CASCADE,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  note TEXT NULL,
  member_visible BOOLEAN NOT NULL DEFAULT true,
  changed_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_request_status_history_to_check
    CHECK (to_status IN ('submitted', 'in_review', 'resolved', 'closed')),
  CONSTRAINT member_request_status_history_from_check
    CHECK (
      from_status IS NULL
      OR from_status IN ('submitted', 'in_review', 'resolved', 'closed')
    ),
  CONSTRAINT member_request_status_history_note_len
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS member_request_status_history_request_idx
  ON blessboard.member_request_status_history (request_id, created_at ASC);
