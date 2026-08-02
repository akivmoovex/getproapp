-- Member journey memberships, contacts, and handovers (additive).
-- Reuses blessboard.ministry_memberships; extends with org/assignment metadata.

ALTER TABLE blessboard.ministry_memberships
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.ministry_memberships
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.ministry_memberships
  ADD COLUMN IF NOT EXISTS assignment_source TEXT NULL;

ALTER TABLE blessboard.ministry_memberships
  ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT;

UPDATE blessboard.ministry_memberships mm
   SET organization_id = c.organization_id
  FROM blessboard.churches c
 WHERE mm.church_id = c.id
   AND mm.organization_id IS NULL;

UPDATE blessboard.ministry_memberships
   SET assignment_source = 'legacy'
 WHERE assignment_source IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM blessboard.ministry_memberships WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'ministry_memberships organization_id backfill incomplete';
  END IF;
END $$;

ALTER TABLE blessboard.ministry_memberships
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE blessboard.ministry_memberships
  ALTER COLUMN assignment_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ministry_memberships_assignment_source_check'
       AND conrelid = 'blessboard.ministry_memberships'::regclass
  ) THEN
    ALTER TABLE blessboard.ministry_memberships
      ADD CONSTRAINT ministry_memberships_assignment_source_check
        CHECK (assignment_source IN (
          'self_join', 'admin', 'handover', 'migration', 'legacy', 'system'
        ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Department / cell / class memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.department_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  department_id UUID NOT NULL
    REFERENCES blessboard.departments (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ NULL,
  assignment_source TEXT NOT NULL DEFAULT 'admin',
  assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT department_memberships_status_check
    CHECK (status IN ('active', 'inactive', 'exited')),
  CONSTRAINT department_memberships_assignment_source_check
    CHECK (assignment_source IN ('admin', 'handover', 'self_join', 'migration', 'system')),
  CONSTRAINT department_memberships_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS department_memberships_active_uidx
  ON blessboard.department_memberships (department_id, member_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS department_memberships_member_idx
  ON blessboard.department_memberships (member_id, status);

CREATE TABLE IF NOT EXISTS blessboard.cell_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  cell_id UUID NOT NULL
    REFERENCES blessboard.cells (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ NULL,
  assignment_source TEXT NOT NULL DEFAULT 'admin',
  assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cell_memberships_status_check
    CHECK (status IN ('active', 'inactive', 'transferred', 'exited')),
  CONSTRAINT cell_memberships_assignment_source_check
    CHECK (assignment_source IN ('admin', 'handover', 'transfer', 'migration', 'system')),
  CONSTRAINT cell_memberships_updated_after_created
    CHECK (updated_at >= created_at)
);

-- One active primary cell per member per church
CREATE UNIQUE INDEX IF NOT EXISTS cell_memberships_primary_active_uidx
  ON blessboard.cell_memberships (church_id, member_id)
  WHERE status = 'active' AND is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS cell_memberships_active_cell_member_uidx
  ON blessboard.cell_memberships (cell_id, member_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS cell_memberships_cell_status_idx
  ON blessboard.cell_memberships (cell_id, status);

CREATE TABLE IF NOT EXISTS blessboard.class_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  cohort_id UUID NOT NULL
    REFERENCES blessboard.class_cohorts (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'enrolled',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  exited_at TIMESTAMPTZ NULL,
  attendance_count INT NOT NULL DEFAULT 0,
  completion_recommended_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  completion_recommended_at TIMESTAMPTZ NULL,
  completion_approved_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  completion_approved_at TIMESTAMPTZ NULL,
  assignment_source TEXT NOT NULL DEFAULT 'admin',
  assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_enrolments_status_check
    CHECK (status IN ('enrolled', 'completed', 'withdrawn', 'cancelled')),
  CONSTRAINT class_enrolments_assignment_source_check
    CHECK (assignment_source IN ('admin', 'handover', 'self_join', 'migration', 'system')),
  CONSTRAINT class_enrolments_attendance_nonneg
    CHECK (attendance_count >= 0),
  CONSTRAINT class_enrolments_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS class_enrolments_active_cohort_member_uidx
  ON blessboard.class_enrolments (cohort_id, member_id)
  WHERE status = 'enrolled';

CREATE INDEX IF NOT EXISTS class_enrolments_member_idx
  ON blessboard.class_enrolments (member_id, status);

CREATE OR REPLACE FUNCTION blessboard.validate_department_membership_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  d_org UUID; d_church UUID; d_branch UUID; m_church UUID;
BEGIN
  SELECT organization_id, church_id, branch_id INTO d_org, d_church, d_branch
    FROM blessboard.departments WHERE id = NEW.department_id;
  IF d_org IS NULL OR d_org IS DISTINCT FROM NEW.organization_id
     OR d_church IS DISTINCT FROM NEW.church_id
     OR d_branch IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'department membership ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT church_id INTO m_church FROM blessboard.members WHERE id = NEW.member_id;
  IF m_church IS NULL OR m_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'department membership member church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS department_memberships_validate ON blessboard.department_memberships;
CREATE TRIGGER department_memberships_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, department_id, member_id
  ON blessboard.department_memberships
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_department_membership_ownership();

CREATE OR REPLACE FUNCTION blessboard.validate_cell_membership_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c_org UUID; c_church UUID; c_branch UUID; m_church UUID;
BEGIN
  SELECT organization_id, church_id, branch_id INTO c_org, c_church, c_branch
    FROM blessboard.cells WHERE id = NEW.cell_id;
  IF c_org IS NULL OR c_org IS DISTINCT FROM NEW.organization_id
     OR c_church IS DISTINCT FROM NEW.church_id
     OR c_branch IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'cell membership ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT church_id INTO m_church FROM blessboard.members WHERE id = NEW.member_id;
  IF m_church IS NULL OR m_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'cell membership member church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cell_memberships_validate ON blessboard.cell_memberships;
CREATE TRIGGER cell_memberships_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, cell_id, member_id
  ON blessboard.cell_memberships
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_cell_membership_ownership();

CREATE OR REPLACE FUNCTION blessboard.validate_class_enrolment_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  co_org UUID; co_church UUID; co_branch UUID; m_church UUID;
BEGIN
  SELECT organization_id, church_id, branch_id INTO co_org, co_church, co_branch
    FROM blessboard.class_cohorts WHERE id = NEW.cohort_id;
  IF co_org IS NULL OR co_org IS DISTINCT FROM NEW.organization_id
     OR co_church IS DISTINCT FROM NEW.church_id
     OR co_branch IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'class enrolment ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT church_id INTO m_church FROM blessboard.members WHERE id = NEW.member_id;
  IF m_church IS NULL OR m_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'class enrolment member church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_enrolments_validate ON blessboard.class_enrolments;
CREATE TRIGGER class_enrolments_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, cohort_id, member_id
  ON blessboard.class_enrolments
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_class_enrolment_ownership();

-- ---------------------------------------------------------------------------
-- Journey contacts (prospects / visitors) — not pastoral notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.journey_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email_normalized TEXT NULL,
  email_display TEXT NULL,
  phone_normalized TEXT NULL,
  phone_display TEXT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_event_id UUID NULL
    REFERENCES blessboard.events (id)
    ON DELETE RESTRICT,
  membership_interest TEXT NULL,
  decision_of_faith BOOLEAN NOT NULL DEFAULT false,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  member_id UUID NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  linked_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journey_contacts_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT journey_contacts_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT journey_contacts_source_type_check
    CHECK (source_type IN ('evangelism', 'registration_desk', 'public_form', 'manual', 'other')),
  CONSTRAINT journey_contacts_consent_status_check
    CHECK (consent_status IN ('unknown', 'granted', 'denied', 'withdrawn')),
  CONSTRAINT journey_contacts_status_check
    CHECK (status IN ('active', 'linked', 'archived', 'closed')),
  CONSTRAINT journey_contacts_membership_interest_len
    CHECK (membership_interest IS NULL OR char_length(membership_interest) BETWEEN 1 AND 200),
  CONSTRAINT journey_contacts_contact_required
    CHECK (email_normalized IS NOT NULL OR phone_normalized IS NOT NULL),
  CONSTRAINT journey_contacts_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS journey_contacts_branch_status_idx
  ON blessboard.journey_contacts (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS journey_contacts_email_idx
  ON blessboard.journey_contacts (church_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS journey_contacts_phone_idx
  ON blessboard.journey_contacts (church_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION blessboard.validate_journey_contact_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  member_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'journey_contacts church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT b.church_id INTO branch_church FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'journey_contacts branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT church_id INTO member_church FROM blessboard.members WHERE id = NEW.member_id;
    IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'journey_contacts member church mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journey_contacts_validate ON blessboard.journey_contacts;
CREATE TRIGGER journey_contacts_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, member_id, email_normalized
  ON blessboard.journey_contacts
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_journey_contact_ownership();

-- ---------------------------------------------------------------------------
-- Handovers + immutable events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_journey_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  journey_contact_id UUID NULL
    REFERENCES blessboard.journey_contacts (id)
    ON DELETE RESTRICT,
  member_id UUID NULL
    REFERENCES blessboard.members (id)
    ON DELETE RESTRICT,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NULL,
  accepted_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ NULL,
  returned_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  returned_at TIMESTAMPTZ NULL,
  return_reason TEXT NULL,
  assigned_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  assigned_scope_type TEXT NULL,
  assigned_scope_id UUID NULL,
  completed_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NULL,
  escalated_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  escalated_at TIMESTAMPTZ NULL,
  closed_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ NULL,
  cancelled_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ NULL,
  notes_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_journey_handovers_subject_required
    CHECK (journey_contact_id IS NOT NULL OR member_id IS NOT NULL),
  CONSTRAINT member_journey_handovers_stage_check
    CHECK (
      from_stage IN (
        'evangelism','registration','first_timers','orientation','cell_assignment',
        'salvation_class','foundation_class','establishment_class','department_service',
        'ongoing_cell_care','minister_referral','pastor_referral'
      )
      AND to_stage IN (
        'evangelism','registration','first_timers','orientation','cell_assignment',
        'salvation_class','foundation_class','establishment_class','department_service',
        'ongoing_cell_care','minister_referral','pastor_referral'
      )
    ),
  CONSTRAINT member_journey_handovers_status_check
    CHECK (status IN (
      'draft','submitted','accepted','returned','assigned',
      'completed','escalated','closed','cancelled'
    )),
  CONSTRAINT member_journey_handovers_return_reason_len
    CHECK (return_reason IS NULL OR char_length(return_reason) BETWEEN 1 AND 500),
  CONSTRAINT member_journey_handovers_notes_summary_len
    CHECK (notes_summary IS NULL OR char_length(notes_summary) BETWEEN 1 AND 500),
  CONSTRAINT member_journey_handovers_assigned_scope_type_check
    CHECK (
      assigned_scope_type IS NULL
      OR assigned_scope_type IN (
        'ministry','department','cell','class','branch','church','assigned_member'
      )
    ),
  CONSTRAINT member_journey_handovers_updated_after_created
    CHECK (updated_at >= created_at)
);

-- One non-terminal active pipeline hop per subject/from/to
CREATE UNIQUE INDEX IF NOT EXISTS member_journey_handovers_active_uidx
  ON blessboard.member_journey_handovers (
    church_id,
    COALESCE(journey_contact_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    from_stage,
    to_stage
  )
  WHERE status IN ('draft', 'submitted', 'accepted', 'returned', 'assigned', 'escalated');

CREATE INDEX IF NOT EXISTS member_journey_handovers_branch_status_idx
  ON blessboard.member_journey_handovers (branch_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS blessboard.member_journey_handover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id UUID NOT NULL
    REFERENCES blessboard.member_journey_handovers (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  event_key TEXT NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_journey_handover_events_event_key_check
    CHECK (event_key IN (
      'journey.handover.created',
      'journey.handover.submitted',
      'journey.handover.accepted',
      'journey.handover.returned',
      'journey.handover.assigned',
      'journey.handover.completed',
      'journey.handover.escalated',
      'journey.handover.closed',
      'journey.handover.cancelled'
    )),
  CONSTRAINT member_journey_handover_events_metadata_is_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT member_journey_handover_events_metadata_size
    CHECK (pg_column_size(metadata_json) <= 8192)
);

CREATE INDEX IF NOT EXISTS member_journey_handover_events_handover_idx
  ON blessboard.member_journey_handover_events (handover_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.prevent_member_journey_handover_events_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'blessboard.member_journey_handover_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS member_journey_handover_events_no_update ON blessboard.member_journey_handover_events;
CREATE TRIGGER member_journey_handover_events_no_update
  BEFORE UPDATE ON blessboard.member_journey_handover_events
  FOR EACH ROW EXECUTE FUNCTION blessboard.prevent_member_journey_handover_events_mutation();

DROP TRIGGER IF EXISTS member_journey_handover_events_no_delete ON blessboard.member_journey_handover_events;
CREATE TRIGGER member_journey_handover_events_no_delete
  BEFORE DELETE ON blessboard.member_journey_handover_events
  FOR EACH ROW EXECUTE FUNCTION blessboard.prevent_member_journey_handover_events_mutation();

CREATE OR REPLACE FUNCTION blessboard.validate_member_journey_handover_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'handover church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT b.church_id INTO branch_church FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'handover branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = 'returned' AND (NEW.return_reason IS NULL OR btrim(NEW.return_reason) = '') THEN
    RAISE EXCEPTION 'returned handover requires return_reason'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_journey_handovers_validate ON blessboard.member_journey_handovers;
CREATE TRIGGER member_journey_handovers_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, status, return_reason
  ON blessboard.member_journey_handovers
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_member_journey_handover_ownership();
