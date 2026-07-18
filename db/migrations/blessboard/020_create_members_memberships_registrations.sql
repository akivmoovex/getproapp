-- BlessBoard V5 member identity foundation (profiles, branch memberships, registrations).
-- Privacy: names + email + phone only. No national ID, health, financial, or family data.

-- ---------------------------------------------------------------------------
-- members: one person record per church (optional link to login user)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  phone_normalized TEXT NULL,
  phone_display TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT members_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT members_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT members_preferred_name_len
    CHECK (preferred_name IS NULL OR char_length(preferred_name) BETWEEN 1 AND 100),
  CONSTRAINT members_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT members_email_display_len
    CHECK (email_display IS NULL OR char_length(email_display) BETWEEN 3 AND 254),
  CONSTRAINT members_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{7,14}$'
        AND char_length(phone_normalized) BETWEEN 9 AND 16
      )
    ),
  CONSTRAINT members_phone_display_len
    CHECK (phone_display IS NULL OR char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT members_contact_required
    CHECK (email_normalized IS NOT NULL OR phone_normalized IS NOT NULL),
  CONSTRAINT members_status_check
    CHECK (status IN ('pending', 'active', 'inactive', 'suspended', 'archived')),
  CONSTRAINT members_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS members_church_status_idx
  ON blessboard.members (church_id, status);

CREATE INDEX IF NOT EXISTS members_user_id_idx
  ON blessboard.members (user_id)
  WHERE user_id IS NOT NULL;

-- Per-church uniqueness for non-archived members (explicit duplicate handling in services).
CREATE UNIQUE INDEX IF NOT EXISTS members_church_email_live_uidx
  ON blessboard.members (church_id, email_normalized)
  WHERE email_normalized IS NOT NULL
    AND status IN ('pending', 'active', 'inactive', 'suspended');

CREATE UNIQUE INDEX IF NOT EXISTS members_church_phone_live_uidx
  ON blessboard.members (church_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND status IN ('pending', 'active', 'inactive', 'suspended');

CREATE OR REPLACE FUNCTION blessboard.normalize_member_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  IF NEW.phone_normalized IS NOT NULL THEN
    NEW.phone_normalized := trim(NEW.phone_normalized);
  END IF;
  IF NEW.phone_display IS NOT NULL THEN
    NEW.phone_display := trim(NEW.phone_display);
  END IF;
  NEW.first_name := trim(NEW.first_name);
  NEW.last_name := trim(NEW.last_name);
  IF NEW.preferred_name IS NOT NULL THEN
    NEW.preferred_name := trim(NEW.preferred_name);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_normalize_contact ON blessboard.members;
CREATE TRIGGER members_normalize_contact
  BEFORE INSERT OR UPDATE OF first_name, last_name, preferred_name,
    email_normalized, email_display, phone_normalized, phone_display
  ON blessboard.members
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.normalize_member_contact();

CREATE OR REPLACE FUNCTION blessboard.prevent_member_archive_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'archived member cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_no_archive_reactivation ON blessboard.members;
CREATE TRIGGER members_no_archive_reactivation
  BEFORE UPDATE OF status ON blessboard.members
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_member_archive_reactivation();

-- ---------------------------------------------------------------------------
-- member_branch_memberships: multi-branch; exactly one primary per member
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_branch_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  membership_status TEXT NOT NULL DEFAULT 'pending',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_branch_memberships_status_check
    CHECK (membership_status IN ('pending', 'active', 'inactive')),
  CONSTRAINT member_branch_memberships_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT member_branch_memberships_member_branch_unique
    UNIQUE (member_id, branch_id)
);

CREATE INDEX IF NOT EXISTS member_branch_memberships_branch_idx
  ON blessboard.member_branch_memberships (branch_id, membership_status);

CREATE UNIQUE INDEX IF NOT EXISTS member_branch_memberships_one_primary_uidx
  ON blessboard.member_branch_memberships (member_id)
  WHERE is_primary = true;

CREATE OR REPLACE FUNCTION blessboard.require_membership_branch_matches_member_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_church UUID;
  branch_church UUID;
BEGIN
  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT b.church_id INTO branch_church
    FROM blessboard.branches b
   WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL THEN
    RAISE EXCEPTION 'membership branch % not found', NEW.branch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF branch_church IS DISTINCT FROM member_church THEN
    RAISE EXCEPTION 'membership branch must belong to member church'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_branch_memberships_church_match
  ON blessboard.member_branch_memberships;
CREATE TRIGGER member_branch_memberships_church_match
  BEFORE INSERT OR UPDATE OF member_id, branch_id
  ON blessboard.member_branch_memberships
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_membership_branch_matches_member_church();

-- ---------------------------------------------------------------------------
-- member_registrations: intake before approval (no automatic user accounts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  phone_normalized TEXT NULL,
  phone_display TEXT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  member_id UUID NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  reviewed_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_registrations_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT member_registrations_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT member_registrations_preferred_name_len
    CHECK (preferred_name IS NULL OR char_length(preferred_name) BETWEEN 1 AND 100),
  CONSTRAINT member_registrations_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT member_registrations_email_display_len
    CHECK (email_display IS NULL OR char_length(email_display) BETWEEN 3 AND 254),
  CONSTRAINT member_registrations_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{7,14}$'
        AND char_length(phone_normalized) BETWEEN 9 AND 16
      )
    ),
  CONSTRAINT member_registrations_phone_display_len
    CHECK (phone_display IS NULL OR char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT member_registrations_contact_required
    CHECK (email_normalized IS NOT NULL OR phone_normalized IS NOT NULL),
  CONSTRAINT member_registrations_status_check
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT member_registrations_review_notes_len
    CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 1 AND 2000),
  CONSTRAINT member_registrations_review_consistency
    CHECK (
      (status IN ('submitted', 'withdrawn')
        AND reviewed_at IS NULL
        AND reviewed_by_user_id IS NULL
        AND member_id IS NULL)
      OR (status = 'under_review' AND member_id IS NULL)
      OR (status = 'rejected'
        AND reviewed_at IS NOT NULL
        AND reviewed_by_user_id IS NOT NULL
        AND member_id IS NULL)
      OR (status = 'approved'
        AND reviewed_at IS NOT NULL
        AND reviewed_by_user_id IS NOT NULL
        AND member_id IS NOT NULL)
    ),
  CONSTRAINT member_registrations_approved_has_member
    CHECK (status <> 'approved' OR member_id IS NOT NULL),
  CONSTRAINT member_registrations_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS member_registrations_church_status_idx
  ON blessboard.member_registrations (church_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS member_registrations_branch_status_idx
  ON blessboard.member_registrations (branch_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS member_registrations_church_email_open_uidx
  ON blessboard.member_registrations (church_id, email_normalized)
  WHERE email_normalized IS NOT NULL
    AND status IN ('submitted', 'under_review');

CREATE UNIQUE INDEX IF NOT EXISTS member_registrations_church_phone_open_uidx
  ON blessboard.member_registrations (church_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND status IN ('submitted', 'under_review');

DROP TRIGGER IF EXISTS member_registrations_branch_owns_church
  ON blessboard.member_registrations;
CREATE TRIGGER member_registrations_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id
  ON blessboard.member_registrations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.normalize_member_registration_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  IF NEW.phone_normalized IS NOT NULL THEN
    NEW.phone_normalized := trim(NEW.phone_normalized);
  END IF;
  IF NEW.phone_display IS NOT NULL THEN
    NEW.phone_display := trim(NEW.phone_display);
  END IF;
  NEW.first_name := trim(NEW.first_name);
  NEW.last_name := trim(NEW.last_name);
  IF NEW.preferred_name IS NOT NULL THEN
    NEW.preferred_name := trim(NEW.preferred_name);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_registrations_normalize_contact
  ON blessboard.member_registrations;
CREATE TRIGGER member_registrations_normalize_contact
  BEFORE INSERT OR UPDATE OF first_name, last_name, preferred_name,
    email_normalized, email_display, phone_normalized, phone_display
  ON blessboard.member_registrations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.normalize_member_registration_contact();
