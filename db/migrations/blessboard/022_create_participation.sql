-- BlessBoard V5 member participation: ministry memberships + event registrations.
-- Leader recommendation deferred (no leader-role product yet). No payments / attendance.

-- Optional event capacity (NULL = unlimited).
ALTER TABLE blessboard.events
  ADD COLUMN IF NOT EXISTS capacity INT NULL;

ALTER TABLE blessboard.events
  DROP CONSTRAINT IF EXISTS events_capacity_check;
ALTER TABLE blessboard.events
  ADD CONSTRAINT events_capacity_check
    CHECK (capacity IS NULL OR capacity >= 1);

-- Ministry join policy: open (auto-active) or request (pending until admin approves).
ALTER TABLE blessboard.ministries
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'request';

ALTER TABLE blessboard.ministries
  DROP CONSTRAINT IF EXISTS ministries_join_policy_check;
ALTER TABLE blessboard.ministries
  ADD CONSTRAINT ministries_join_policy_check
    CHECK (join_policy IN ('open', 'request'));

-- ---------------------------------------------------------------------------
-- ministry_memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.ministry_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  ministry_id UUID NOT NULL
    REFERENCES blessboard.ministries (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  reviewed_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  review_notes TEXT NULL,
  joined_at TIMESTAMPTZ NULL,
  left_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ministry_memberships_status_check
    CHECK (status IN ('pending', 'active', 'rejected', 'left', 'cancelled')),
  CONSTRAINT ministry_memberships_message_len
    CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 1000),
  CONSTRAINT ministry_memberships_review_notes_len
    CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 1 AND 1000),
  CONSTRAINT ministry_memberships_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS ministry_memberships_open_uidx
  ON blessboard.ministry_memberships (member_id, ministry_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS ministry_memberships_ministry_status_idx
  ON blessboard.ministry_memberships (ministry_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ministry_memberships_church_member_idx
  ON blessboard.ministry_memberships (church_id, member_id);

CREATE OR REPLACE FUNCTION blessboard.require_ministry_membership_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ministry_church UUID;
  ministry_status TEXT;
  member_church UUID;
BEGIN
  SELECT m.church_id, m.status INTO ministry_church, ministry_status
    FROM blessboard.ministries m
   WHERE m.id = NEW.ministry_id;
  IF ministry_church IS NULL THEN
    RAISE EXCEPTION 'ministry % not found', NEW.ministry_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF ministry_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'ministry membership church must match ministry'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT mb.church_id INTO member_church
    FROM blessboard.members mb
   WHERE mb.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'ministry membership church must match member'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ministry_memberships_scope ON blessboard.ministry_memberships;
CREATE TRIGGER ministry_memberships_scope
  BEFORE INSERT OR UPDATE OF church_id, ministry_id, member_id
  ON blessboard.ministry_memberships
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_ministry_membership_scope();

-- ---------------------------------------------------------------------------
-- event_registrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  event_id UUID NOT NULL
    REFERENCES blessboard.events (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered',
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_status_check
    CHECK (status IN ('registered', 'cancelled')),
  CONSTRAINT event_registrations_cancelled_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL)
      OR (status = 'registered' AND cancelled_at IS NULL)
    ),
  CONSTRAINT event_registrations_member_event_unique
    UNIQUE (member_id, event_id),
  CONSTRAINT event_registrations_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx
  ON blessboard.event_registrations (event_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS event_registrations_church_member_idx
  ON blessboard.event_registrations (church_id, member_id);

CREATE OR REPLACE FUNCTION blessboard.require_event_registration_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_church UUID;
  member_church UUID;
BEGIN
  SELECT e.church_id INTO event_church
    FROM blessboard.events e
   WHERE e.id = NEW.event_id;
  IF event_church IS NULL THEN
    RAISE EXCEPTION 'event % not found', NEW.event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF event_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'event registration church must match event'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT mb.church_id INTO member_church
    FROM blessboard.members mb
   WHERE mb.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'event registration church must match member'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_registrations_scope ON blessboard.event_registrations;
CREATE TRIGGER event_registrations_scope
  BEFORE INSERT OR UPDATE OF church_id, event_id, member_id
  ON blessboard.event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_event_registration_scope();
