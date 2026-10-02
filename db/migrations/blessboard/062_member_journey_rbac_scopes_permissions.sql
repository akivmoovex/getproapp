-- Extend RBAC scopes for member journey + seed journey permissions/role maps.
-- Additive; does not alter legacy user_roles CHECK.

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
      'assigned_member'
    ));

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_ministry_scope;
ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_ministry_scope
    CHECK (
      scope_type <> 'ministry'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_department_scope;
ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_department_scope
    CHECK (
      scope_type <> 'department'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_cell_scope;
ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_cell_scope
    CHECK (
      scope_type <> 'cell'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_class_scope;
ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_class_scope
    CHECK (
      scope_type <> 'class'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

ALTER TABLE blessboard.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_assigned_member_scope;
ALTER TABLE blessboard.user_role_assignments
  ADD CONSTRAINT user_role_assignments_assigned_member_scope
    CHECK (
      scope_type <> 'assigned_member'
      OR (church_id IS NOT NULL AND scope_id IS NOT NULL)
    );

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
    SELECT organization_id, church_id, branch_id INTO domain_org, domain_church, domain_branch
      FROM blessboard.departments WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments department scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'cell' THEN
    SELECT organization_id, church_id, branch_id INTO domain_org, domain_church, domain_branch
      FROM blessboard.cells WHERE id = NEW.scope_id;
    IF domain_org IS NULL OR domain_org IS DISTINCT FROM NEW.organization_id
       OR domain_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_role_assignments cell scope ownership mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.scope_type = 'class' THEN
    SELECT organization_id, church_id, branch_id INTO domain_org, domain_church, domain_branch
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

  RETURN NEW;
END;
$$;

-- Journey permissions
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('ministries.view', 'ministries', 'view', 'View ministries', 'View ministry catalogue and status', 'standard'),
  ('ministries.manage', 'ministries', 'manage', 'Manage ministries', 'Create and update ministries', 'standard'),
  ('departments.view', 'departments', 'view', 'View departments', 'View departments', 'standard'),
  ('departments.manage', 'departments', 'manage', 'Manage departments', 'Create and update departments', 'standard'),
  ('departments.members.manage', 'departments', 'manage', 'Manage department members', 'Add/remove department members', 'standard'),
  ('departments.attendance.record', 'departments', 'record', 'Record department attendance', 'Record department attendance', 'standard'),
  ('cells.view', 'cells', 'view', 'View cells', 'View cells', 'standard'),
  ('cells.manage', 'cells', 'manage', 'Manage cells', 'Create and update cells', 'standard'),
  ('cells.members.assign', 'cells', 'assign', 'Assign cell members', 'Assign members to cells', 'standard'),
  ('cells.members.transfer', 'cells', 'transfer', 'Transfer cell members', 'Transfer members between cells', 'standard'),
  ('cells.members.view_assigned', 'cells', 'view_assigned', 'View assigned cell members', 'View members of assigned cells', 'standard'),
  ('cells.attendance.record', 'cells', 'record', 'Record cell attendance', 'Record cell attendance', 'standard'),
  ('classes.view', 'classes', 'view', 'View classes', 'View class programs and cohorts', 'standard'),
  ('classes.manage_programs', 'classes', 'manage_programs', 'Manage class programs', 'Manage class programs', 'standard'),
  ('classes.manage_cohorts', 'classes', 'manage_cohorts', 'Manage class cohorts', 'Manage class cohorts', 'standard'),
  ('classes.enrol', 'classes', 'enrol', 'Enrol class members', 'Enrol members into cohorts', 'standard'),
  ('classes.attendance.record', 'classes', 'record', 'Record class attendance', 'Record class attendance', 'standard'),
  ('classes.completion.recommend', 'classes', 'recommend', 'Recommend class completion', 'Recommend cohort completion', 'standard'),
  ('classes.completion.approve', 'classes', 'approve', 'Approve class completion', 'Approve cohort completion', 'sensitive'),
  ('journey_contacts.create', 'journey_contacts', 'create', 'Create journey contacts', 'Create visitor/prospect contacts', 'standard'),
  ('journey_contacts.view_team', 'journey_contacts', 'view_team', 'View team journey contacts', 'View contacts for assigned ministry/team', 'standard'),
  ('journey_contacts.edit_team', 'journey_contacts', 'edit_team', 'Edit team journey contacts', 'Edit contacts before handover acceptance', 'standard'),
  ('journey_contacts.link_member', 'journey_contacts', 'link_member', 'Link contact to member', 'Link journey contact to member', 'standard'),
  ('journey_handovers.create', 'journey_handovers', 'create', 'Create handovers', 'Create journey handovers', 'standard'),
  ('journey_handovers.submit', 'journey_handovers', 'submit', 'Submit handovers', 'Submit handovers', 'standard'),
  ('journey_handovers.accept', 'journey_handovers', 'accept', 'Accept handovers', 'Accept handovers', 'standard'),
  ('journey_handovers.return', 'journey_handovers', 'return', 'Return handovers', 'Return handovers with reason', 'standard'),
  ('journey_handovers.assign', 'journey_handovers', 'assign', 'Assign handovers', 'Assign accepted handovers', 'standard'),
  ('journey_handovers.complete', 'journey_handovers', 'complete', 'Complete handovers', 'Complete handovers', 'standard'),
  ('journey_handovers.escalate', 'journey_handovers', 'escalate', 'Escalate handovers', 'Escalate to minister/pastor placeholder', 'sensitive'),
  ('journey_handovers.close', 'journey_handovers', 'close', 'Close handovers', 'Close completed handovers', 'standard'),
  ('journey_handovers.view_status', 'journey_handovers', 'view_status', 'View handover status', 'View handover status (read-only)', 'standard')
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  is_active = true,
  updated_at = now();

-- Role maps (conservative)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'ministry_leader'
   AND p.permission_key IN (
     'ministries.view', 'ministries.manage',
     'journey_contacts.view_team', 'journey_contacts.edit_team', 'journey_contacts.create',
     'journey_handovers.create', 'journey_handovers.submit', 'journey_handovers.accept',
     'journey_handovers.view_status'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'registration_officer'
   AND p.permission_key IN (
     'journey_contacts.create', 'journey_contacts.view_team', 'journey_contacts.edit_team',
     'journey_handovers.create', 'journey_handovers.submit', 'journey_handovers.view_status',
     'events.view'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'first_timers_coordinator'
   AND p.permission_key IN (
     'journey_contacts.view_team', 'journey_contacts.edit_team', 'journey_contacts.link_member',
     'journey_handovers.accept', 'journey_handovers.return', 'journey_handovers.assign',
     'journey_handovers.complete', 'journey_handovers.create', 'journey_handovers.submit',
     'journey_handovers.view_status',
     'classes.view', 'classes.enrol', 'classes.attendance.record'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'classes_coordinator'
   AND p.permission_key IN (
     'classes.view', 'classes.manage_programs', 'classes.manage_cohorts', 'classes.enrol',
     'classes.attendance.record', 'classes.completion.recommend', 'classes.completion.approve',
     'journey_handovers.accept', 'journey_handovers.assign', 'journey_handovers.complete',
     'journey_handovers.view_status'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'cell_coordinator'
   AND p.permission_key IN (
     'cells.view', 'cells.manage', 'cells.members.assign', 'cells.members.transfer',
     'cells.members.view_assigned', 'cells.attendance.record',
     'journey_handovers.accept', 'journey_handovers.assign', 'journey_handovers.complete',
     'journey_handovers.view_status'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'cell_leader'
   AND p.permission_key IN (
     'cells.view', 'cells.members.view_assigned', 'cells.attendance.record',
     'classes.view', 'journey_handovers.view_status',
     'journey_handovers.create', 'journey_handovers.submit', 'journey_handovers.escalate'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'department_head'
   AND p.permission_key IN (
     'departments.view', 'departments.manage', 'departments.members.manage',
     'departments.attendance.record', 'journey_handovers.view_status'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'service_director'
   AND p.permission_key IN (
     'departments.view', 'departments.members.manage', 'journey_handovers.view_status'
   )
ON CONFLICT DO NOTHING;

-- HQ / org / platform admin: broad non-confidential journey oversight
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('church_system_administrator', 'organisation_administrator', 'platform_administrator')
   AND (
     p.permission_key LIKE 'ministries.%'
     OR p.permission_key LIKE 'departments.%'
     OR p.permission_key LIKE 'cells.%'
     OR p.permission_key LIKE 'classes.%'
     OR p.permission_key LIKE 'journey_contacts.%'
     OR p.permission_key LIKE 'journey_handovers.%'
   )
ON CONFLICT DO NOTHING;

-- Branch admin: minimal journey compatibility (not every new permission)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_administrator'
   AND p.permission_key IN (
     'ministries.view', 'departments.view', 'cells.view', 'classes.view',
     'journey_contacts.view_team', 'journey_handovers.view_status',
     'journey_contacts.create', 'journey_handovers.create', 'journey_handovers.submit'
   )
ON CONFLICT DO NOTHING;
