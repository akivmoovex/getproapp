-- BlessBoard V5 aggregate attendance (branch headcounts).
-- No individual-member attendance. No fake analytics.

CREATE TABLE IF NOT EXISTS blessboard.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  event_date DATE NOT NULL,
  event_at TIMESTAMPTZ NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  submitted_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NULL,
  approved_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_events_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT attendance_events_event_type_len
    CHECK (char_length(event_type) BETWEEN 1 AND 64),
  CONSTRAINT attendance_events_event_type_check
    CHECK (event_type IN (
      'sunday_service',
      'midweek',
      'special',
      'youth',
      'children',
      'other'
    )),
  CONSTRAINT attendance_events_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'archived')),
  CONSTRAINT attendance_events_submitted_consistency
    CHECK (
      (status IN ('submitted', 'approved', 'archived') AND submitted_at IS NOT NULL)
      OR (status = 'draft')
    ),
  CONSTRAINT attendance_events_approved_consistency
    CHECK (
      (status IN ('approved', 'archived') AND approved_at IS NOT NULL)
      OR (status IN ('draft', 'submitted'))
    ),
  CONSTRAINT attendance_events_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS attendance_events_church_date_idx
  ON blessboard.attendance_events (church_id, event_date DESC);

CREATE INDEX IF NOT EXISTS attendance_events_branch_date_idx
  ON blessboard.attendance_events (branch_id, event_date DESC, status);

DROP TRIGGER IF EXISTS attendance_events_branch_owns_church ON blessboard.attendance_events;
CREATE TRIGGER attendance_events_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.prevent_attendance_archive_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'archived attendance event cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_events_no_archive_reactivation ON blessboard.attendance_events;
CREATE TRIGGER attendance_events_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_attendance_archive_reactivation();

-- ---------------------------------------------------------------------------
-- attendance_entries: aggregate category counts per event
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.attendance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  attendance_event_id UUID NOT NULL
    REFERENCES blessboard.attendance_events (id)
    ON DELETE CASCADE,
  category TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  submitted_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_entries_category_check
    CHECK (category IN (
      'adults',
      'youth',
      'children',
      'first_time_visitors',
      'volunteers',
      'other'
    )),
  CONSTRAINT attendance_entries_count_non_negative
    CHECK (count >= 0),
  CONSTRAINT attendance_entries_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  CONSTRAINT attendance_entries_event_category_unique
    UNIQUE (attendance_event_id, category),
  CONSTRAINT attendance_entries_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS attendance_entries_event_idx
  ON blessboard.attendance_entries (attendance_event_id);

CREATE INDEX IF NOT EXISTS attendance_entries_church_idx
  ON blessboard.attendance_entries (church_id, category);

CREATE OR REPLACE FUNCTION blessboard.require_attendance_entry_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_church UUID;
BEGIN
  SELECT e.church_id INTO event_church
    FROM blessboard.attendance_events e
   WHERE e.id = NEW.attendance_event_id;
  IF event_church IS NULL THEN
    RAISE EXCEPTION 'attendance event % not found', NEW.attendance_event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF event_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'attendance entry church must match event'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_entries_scope ON blessboard.attendance_entries;
CREATE TRIGGER attendance_entries_scope
  BEFORE INSERT OR UPDATE OF church_id, attendance_event_id
  ON blessboard.attendance_entries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_attendance_entry_scope();
