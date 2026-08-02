-- Pastoral care + welfare confidential domain (additive).
-- Does not alter member_requests bodies; sealed content lives here only.

-- ---------------------------------------------------------------------------
-- RBAC: assigned_case scope
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_scope_type_check;

ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_scope_type_check
    CHECK (scope_type IN (
      'platform',
      'organisation',
      'church',
      'branch',
      'personal',
      'ministry',
      'department',
      'cell',
      'class',
      'assigned_member',
      'assigned_case'
    ));

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_assigned_case_scope;

ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_assigned_case_scope
    CHECK (
      scope_type <> 'assigned_case'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- Pastoral cases
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.pastoral_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id) ON DELETE RESTRICT,
  member_id UUID NULL
    REFERENCES blessboard.members (id) ON DELETE RESTRICT,
  source_handover_id UUID NULL
    REFERENCES blessboard.member_journey_handovers (id) ON DELETE RESTRICT,
  case_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  confidentiality_level TEXT NOT NULL DEFAULT 'general_care',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  opened_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  assigned_minister_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  assigned_pastor_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  escalated_at TIMESTAMPTZ NULL,
  escalated_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ NULL,
  closed_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pastoral_cases_key_format
    CHECK (case_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT pastoral_cases_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT pastoral_cases_category_check
    CHECK (category IN (
      'general', 'restoration', 'absence', 'referral', 'safeguarding', 'other'
    )),
  CONSTRAINT pastoral_cases_confidentiality_check
    CHECK (confidentiality_level IN (
      'general_care', 'restricted_care', 'highly_confidential', 'safeguarding_restricted'
    )),
  CONSTRAINT pastoral_cases_status_check
    CHECK (status IN ('open', 'assigned', 'escalated', 'closed', 'archived')),
  CONSTRAINT pastoral_cases_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS pastoral_cases_church_key_live_uidx
  ON blessboard.pastoral_cases (church_id, case_key)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS pastoral_cases_branch_status_idx
  ON blessboard.pastoral_cases (branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS pastoral_cases_member_idx
  ON blessboard.pastoral_cases (member_id)
  WHERE member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS blessboard.pastoral_case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL
    REFERENCES blessboard.pastoral_cases (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  assignment_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pastoral_case_assignments_role_check
    CHECK (assignment_role IN ('minister', 'pastor', 'safeguarding', 'referrer', 'viewer')),
  CONSTRAINT pastoral_case_assignments_status_check
    CHECK (status IN ('active', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pastoral_case_assignments_active_uidx
  ON blessboard.pastoral_case_assignments (case_id, user_id, assignment_role)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS blessboard.pastoral_case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL
    REFERENCES blessboard.pastoral_cases (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  author_user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  note_visibility TEXT NOT NULL DEFAULT 'assigned_care',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pastoral_case_notes_visibility_check
    CHECK (note_visibility IN (
      'referrer_safe', 'assigned_care', 'minister_only', 'pastor_only', 'safeguarding_only'
    )),
  CONSTRAINT pastoral_case_notes_body_len
    CHECK (char_length(body) BETWEEN 1 AND 20000)
);

CREATE INDEX IF NOT EXISTS pastoral_case_notes_case_idx
  ON blessboard.pastoral_case_notes (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blessboard.pastoral_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL
    REFERENCES blessboard.pastoral_cases (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  actor_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  event_key TEXT NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  previous_confidentiality TEXT NULL,
  new_confidentiality TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pastoral_case_events_event_key_check
    CHECK (event_key IN (
      'pastoral.case.created',
      'pastoral.case.assigned',
      'pastoral.case.confidentiality_changed',
      'pastoral.case.escalated',
      'pastoral.case.closed',
      'pastoral.case.reopened',
      'pastoral.case.archived',
      'pastoral.case.note_added',
      'pastoral.case.highly_confidential_accessed',
      'pastoral.case.safeguarding_accessed'
    )),
  CONSTRAINT pastoral_case_events_metadata_is_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT pastoral_case_events_metadata_size
    CHECK (octet_length(metadata_json::text) <= 4000)
);

CREATE INDEX IF NOT EXISTS pastoral_case_events_case_idx
  ON blessboard.pastoral_case_events (case_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.prevent_pastoral_case_events_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'blessboard.pastoral_case_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS pastoral_case_events_no_update ON blessboard.pastoral_case_events;
CREATE TRIGGER pastoral_case_events_no_update
  BEFORE UPDATE ON blessboard.pastoral_case_events
  FOR EACH ROW EXECUTE FUNCTION blessboard.prevent_pastoral_case_events_mutation();

DROP TRIGGER IF EXISTS pastoral_case_events_no_delete ON blessboard.pastoral_case_events;
CREATE TRIGGER pastoral_case_events_no_delete
  BEFORE DELETE ON blessboard.pastoral_case_events
  FOR EACH ROW EXECUTE FUNCTION blessboard.prevent_pastoral_case_events_mutation();

CREATE OR REPLACE FUNCTION blessboard.validate_pastoral_case_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  member_church UUID;
BEGIN
  SELECT organization_id INTO church_org FROM blessboard.churches WHERE id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'pastoral_cases church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT church_id INTO branch_church FROM blessboard.branches WHERE id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'pastoral_cases branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT church_id INTO member_church FROM blessboard.members WHERE id = NEW.member_id;
    IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'pastoral_cases member church mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pastoral_cases_validate ON blessboard.pastoral_cases;
CREATE TRIGGER pastoral_cases_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, member_id
  ON blessboard.pastoral_cases
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_pastoral_case_ownership();

-- ---------------------------------------------------------------------------
-- Welfare
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.welfare_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id) ON DELETE RESTRICT,
  member_id UUID NULL
    REFERENCES blessboard.members (id) ON DELETE RESTRICT,
  case_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  opened_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT welfare_cases_key_format
    CHECK (case_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT welfare_cases_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT welfare_cases_status_check
    CHECK (status IN ('open', 'active', 'closed', 'archived')),
  CONSTRAINT welfare_cases_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS welfare_cases_church_key_live_uidx
  ON blessboard.welfare_cases (church_id, case_key)
  WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS blessboard.welfare_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_case_id UUID NOT NULL
    REFERENCES blessboard.welfare_cases (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id) ON DELETE RESTRICT,
  member_id UUID NULL
    REFERENCES blessboard.members (id) ON DELETE RESTRICT,
  requested_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  assistance_type TEXT NOT NULL DEFAULT 'other',
  amount_requested NUMERIC(12, 2) NULL,
  currency_code TEXT NULL,
  operational_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ NULL,
  CONSTRAINT welfare_requests_status_check
    CHECK (status IN (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled', 'distributed', 'completed'
    )),
  CONSTRAINT welfare_requests_assistance_type_check
    CHECK (assistance_type IN ('food', 'transport', 'medical', 'housing', 'other')),
  CONSTRAINT welfare_requests_summary_len
    CHECK (char_length(operational_summary) BETWEEN 1 AND 500),
  CONSTRAINT welfare_requests_currency_len
    CHECK (currency_code IS NULL OR char_length(currency_code) = 3),
  CONSTRAINT welfare_requests_amount_nonneg
    CHECK (amount_requested IS NULL OR amount_requested >= 0),
  CONSTRAINT welfare_requests_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS welfare_requests_branch_status_idx
  ON blessboard.welfare_requests (branch_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS blessboard.welfare_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_request_id UUID NOT NULL
    REFERENCES blessboard.welfare_requests (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  decision TEXT NOT NULL,
  decision_reason TEXT NULL,
  amount_approved NUMERIC(12, 2) NULL,
  finance_instruction_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT welfare_approvals_decision_check
    CHECK (decision IN ('approved', 'rejected')),
  CONSTRAINT welfare_approvals_reason_len
    CHECK (decision_reason IS NULL OR char_length(decision_reason) BETWEEN 1 AND 500),
  CONSTRAINT welfare_approvals_finance_instruction_len
    CHECK (
      finance_instruction_summary IS NULL
      OR char_length(finance_instruction_summary) BETWEEN 1 AND 500
    ),
  CONSTRAINT welfare_approvals_amount_nonneg
    CHECK (amount_approved IS NULL OR amount_approved >= 0)
);

CREATE INDEX IF NOT EXISTS welfare_approvals_request_idx
  ON blessboard.welfare_approvals (welfare_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blessboard.welfare_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_request_id UUID NOT NULL
    REFERENCES blessboard.welfare_requests (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  recorded_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  amount_distributed NUMERIC(12, 2) NOT NULL,
  currency_code TEXT NOT NULL,
  distribution_method TEXT NOT NULL DEFAULT 'other',
  recipient_acknowledged BOOLEAN NOT NULL DEFAULT false,
  distribution_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT welfare_distributions_amount_pos
    CHECK (amount_distributed > 0),
  CONSTRAINT welfare_distributions_currency_len
    CHECK (char_length(currency_code) = 3),
  CONSTRAINT welfare_distributions_method_check
    CHECK (distribution_method IN ('cash', 'transfer', 'voucher', 'in_kind', 'other')),
  CONSTRAINT welfare_distributions_note_len
    CHECK (distribution_note IS NULL OR char_length(distribution_note) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS welfare_distributions_request_idx
  ON blessboard.welfare_distributions (welfare_request_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.validate_welfare_case_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  SELECT organization_id INTO church_org FROM blessboard.churches WHERE id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'welfare_cases church/org mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT church_id INTO branch_church FROM blessboard.branches WHERE id = NEW.branch_id;
  IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'welfare_cases branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS welfare_cases_validate ON blessboard.welfare_cases;
CREATE TRIGGER welfare_cases_validate
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id
  ON blessboard.welfare_cases
  FOR EACH ROW EXECUTE FUNCTION blessboard.validate_welfare_case_ownership();

-- Extend ownership trigger for assigned_case (pastoral_cases or welfare_cases)
CREATE OR REPLACE FUNCTION blessboard.validate_user_role_assignment_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  domain_org UUID;
  domain_church UUID;
  domain_branch UUID;
BEGIN
  IF NEW.church_id IS NOT NULL THEN
    SELECT c.organization_id INTO church_org
      FROM blessboard.churches c
     WHERE c.id = NEW.church_id;
    IF church_org IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments church_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF church_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments church must belong to organization'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'branch' THEN
    SELECT b.church_id INTO branch_church
      FROM blessboard.branches b
     WHERE b.id = NEW.scope_id;
    IF branch_church IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments branch scope_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.church_id IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments branch must belong to church'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'church' AND NEW.scope_id IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments church scope_id must equal church_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.scope_type = 'organisation' AND NEW.scope_id IS NOT NULL
     AND NEW.scope_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments organisation scope_id must equal organization_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.scope_type = 'personal' AND NEW.scope_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'blessboard.user_role_assignments personal scope_id must equal user_id'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.scope_type = 'ministry' THEN
    SELECT organization_id, church_id INTO domain_org, domain_church
      FROM blessboard.ministries WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments ministry scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'department' THEN
    SELECT organization_id, church_id INTO domain_org, domain_church
      FROM blessboard.departments WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments department scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'cell' THEN
    SELECT organization_id, church_id INTO domain_org, domain_church
      FROM blessboard.cells WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments cell scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'class' THEN
    SELECT organization_id, church_id INTO domain_org, domain_church
      FROM blessboard.class_cohorts WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments class scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'assigned_member' THEN
    SELECT church_id INTO domain_church
      FROM blessboard.members WHERE id = NEW.scope_id;
    IF domain_church IS NULL OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments assigned_member scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'assigned_case' THEN
    SELECT organization_id, church_id INTO domain_org, domain_church
      FROM blessboard.pastoral_cases WHERE id = NEW.scope_id;
    IF domain_org IS NULL THEN
      SELECT organization_id, church_id INTO domain_org, domain_church
        FROM blessboard.welfare_cases WHERE id = NEW.scope_id;
    END IF;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments assigned_case scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Roles + permissions
-- ---------------------------------------------------------------------------

INSERT INTO blessboard.roles (role_key, display_name, description, role_category, is_sensitive)
VALUES
  ('welfare_approver', 'Welfare Approver', 'Approves welfare assistance (not requester)', 'pastoral', true),
  ('safeguarding_officer', 'Safeguarding Officer', 'Safeguarding-restricted pastoral cases', 'pastoral', true)
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive,
  updated_at = now();

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('pastoral_referrals.create', 'pastoral_referrals', 'create', 'Create pastoral referral', 'Create basic pastoral referral', 'standard'),
  ('pastoral_cases.create', 'pastoral_cases', 'create', 'Create pastoral case', 'Open pastoral case', 'sensitive'),
  ('pastoral_cases.view_assigned', 'pastoral_cases', 'view_assigned', 'View assigned pastoral cases', 'View assigned pastoral cases metadata', 'sensitive'),
  ('pastoral_cases.edit_assigned', 'pastoral_cases', 'edit_assigned', 'Edit assigned pastoral cases', 'Edit assigned pastoral cases', 'sensitive'),
  ('pastoral_cases.assign', 'pastoral_cases', 'assign', 'Assign pastoral cases', 'Assign pastoral case owners', 'sensitive'),
  ('pastoral_cases.escalate', 'pastoral_cases', 'escalate', 'Escalate pastoral cases', 'Escalate pastoral cases', 'sensitive'),
  ('pastoral_cases.close', 'pastoral_cases', 'close', 'Close pastoral cases', 'Close pastoral cases', 'sensitive'),
  ('pastoral_cases.view_restricted', 'pastoral_cases', 'view_restricted', 'View restricted pastoral notes', 'View restricted_care notes', 'sensitive'),
  ('pastoral_cases.view_highly_confidential', 'pastoral_cases', 'view_highly_confidential', 'View highly confidential pastoral notes', 'View highly confidential notes', 'highly_sensitive'),
  ('pastoral_cases.view_safeguarding', 'pastoral_cases', 'view_safeguarding', 'View safeguarding pastoral notes', 'View safeguarding-restricted notes', 'highly_sensitive'),
  ('welfare_cases.create', 'welfare_cases', 'create', 'Create welfare case', 'Create welfare case', 'sensitive'),
  ('welfare_cases.view_assigned', 'welfare_cases', 'view_assigned', 'View assigned welfare', 'View assigned welfare cases/requests', 'sensitive'),
  ('welfare_cases.manage', 'welfare_cases', 'manage', 'Manage welfare cases', 'Manage welfare cases', 'sensitive'),
  ('welfare_cases.request_assistance', 'welfare_cases', 'request_assistance', 'Request welfare assistance', 'Submit welfare assistance request', 'sensitive'),
  ('welfare_cases.approve_assistance', 'welfare_cases', 'approve_assistance', 'Approve welfare assistance', 'Approve or reject welfare requests', 'sensitive'),
  ('welfare_cases.record_distribution', 'welfare_cases', 'record_distribution', 'Record welfare distribution', 'Record welfare distribution', 'sensitive')
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  is_active = true,
  updated_at = now();

-- Cell leader: referral only
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'cell_leader'
   AND p.permission_key IN (
     'pastoral_referrals.create', 'pastoral_cases.view_assigned'
   )
ON CONFLICT DO NOTHING;

-- Minister
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'minister'
   AND p.permission_key IN (
     'pastoral_cases.create', 'pastoral_cases.view_assigned', 'pastoral_cases.edit_assigned',
     'pastoral_cases.escalate', 'pastoral_cases.close', 'pastoral_cases.view_restricted'
   )
ON CONFLICT DO NOTHING;

-- Branch pastor / pastor oversight
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_pastor'
   AND p.permission_key IN (
     'pastoral_cases.create', 'pastoral_cases.view_assigned', 'pastoral_cases.edit_assigned',
     'pastoral_cases.assign', 'pastoral_cases.escalate', 'pastoral_cases.close',
     'pastoral_cases.view_restricted', 'pastoral_cases.view_highly_confidential'
   )
ON CONFLICT DO NOTHING;

-- Safeguarding officer
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'safeguarding_officer'
   AND p.permission_key IN (
     'pastoral_cases.view_assigned', 'pastoral_cases.edit_assigned',
     'pastoral_cases.view_safeguarding', 'pastoral_cases.view_highly_confidential',
     'pastoral_cases.close'
   )
ON CONFLICT DO NOTHING;

-- Welfare officer / approver
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'welfare_officer'
   AND p.permission_key IN (
     'welfare_cases.create', 'welfare_cases.view_assigned', 'welfare_cases.manage',
     'welfare_cases.request_assistance', 'welfare_cases.record_distribution'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'welfare_approver'
   AND p.permission_key IN (
     'welfare_cases.view_assigned', 'welfare_cases.approve_assistance'
   )
ON CONFLICT DO NOTHING;

-- Explicitly do NOT grant pastoral confidential permissions to platform/org/HQ admin roles here.
-- Finance roles also receive no pastoral permissions.
