-- BlessBoard V5 RBAC foundation: permission + role catalogue (additive).
-- Does not alter blessboard.user_roles or its role_key CHECK.
-- Catalogue seed is system-only; no user assignments.

CREATE TABLE IF NOT EXISTS blessboard.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'standard',
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permissions_permission_key_unique UNIQUE (permission_key),
  CONSTRAINT permissions_permission_key_format
    CHECK (permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT permissions_resource_key_format
    CHECK (resource_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT permissions_action_key_format
    CHECK (action_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT permissions_key_parts_match
    CHECK (
      split_part(permission_key, '.', 1) = resource_key
      AND reverse(split_part(reverse(permission_key), '.', 1)) = action_key
    ),
  CONSTRAINT permissions_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT permissions_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  CONSTRAINT permissions_sensitivity_check
    CHECK (sensitivity IN ('standard', 'sensitive', 'highly_sensitive')),
  CONSTRAINT permissions_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS permissions_resource_action_idx
  ON blessboard.permissions (resource_key, action_key);

CREATE INDEX IF NOT EXISTS permissions_active_idx
  ON blessboard.permissions (is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS blessboard.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  role_category TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roles_role_key_unique UNIQUE (role_key),
  CONSTRAINT roles_role_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT roles_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT roles_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  CONSTRAINT roles_role_category_check
    CHECK (role_category IN (
      'platform',
      'organisation',
      'church',
      'branch',
      'ministry',
      'finance',
      'pastoral',
      'communications',
      'website',
      'audit',
      'member',
      'visitor'
    )),
  CONSTRAINT roles_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS roles_active_idx
  ON blessboard.roles (is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS roles_category_idx
  ON blessboard.roles (role_category);

CREATE TABLE IF NOT EXISTS blessboard.role_permissions (
  role_id UUID NOT NULL
    REFERENCES blessboard.roles (id)
    ON DELETE RESTRICT,
  permission_id UUID NOT NULL
    REFERENCES blessboard.permissions (id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx
  ON blessboard.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- System catalogue seed (idempotent). No user assignments.
-- ---------------------------------------------------------------------------

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('organisation.view', 'organisation', 'view', 'View organisation', 'View organisation profile and status', 'standard'),
  ('organisation.settings.manage', 'organisation', 'manage', 'Manage organisation settings', 'Update church/organisation settings', 'standard'),
  ('branches.view', 'branches', 'view', 'View branches', 'List and view branches', 'standard'),
  ('branches.create', 'branches', 'create', 'Create branches', 'Create additional branches', 'standard'),
  ('branches.edit', 'branches', 'edit', 'Edit branches', 'Update branch settings', 'standard'),
  ('branches.archive', 'branches', 'archive', 'Archive branches', 'Archive inactive branches', 'sensitive'),
  ('members.view', 'members', 'view', 'View members', 'View member directory within scope', 'standard'),
  ('members.create', 'members', 'create', 'Create members', 'Create or approve members', 'standard'),
  ('members.edit', 'members', 'edit', 'Edit members', 'Update member profiles', 'standard'),
  ('members.archive', 'members', 'archive', 'Archive members', 'Archive members', 'sensitive'),
  ('attendance.view', 'attendance', 'view', 'View attendance', 'View attendance records', 'standard'),
  ('attendance.record', 'attendance', 'record', 'Record attendance', 'Record attendance events', 'standard'),
  ('events.view', 'events', 'view', 'View events', 'View events and participation', 'standard'),
  ('events.manage', 'events', 'manage', 'Manage events', 'Create and manage events', 'standard'),
  ('website.view', 'website', 'view', 'View website admin', 'View website admin surfaces', 'standard'),
  ('website.edit', 'website', 'edit', 'Edit website', 'Edit website drafts and content', 'standard'),
  ('website.publish', 'website', 'publish', 'Publish website', 'Publish website changes', 'sensitive'),
  ('giving.view_summary', 'giving', 'view_summary', 'View giving summaries', 'View aggregated giving entries', 'standard'),
  ('giving.record', 'giving', 'record', 'Record giving', 'Create draft giving entries', 'standard'),
  ('giving.submit', 'giving', 'submit', 'Submit giving', 'Submit giving entries for approval', 'standard'),
  ('giving.approve', 'giving', 'approve', 'Approve giving', 'Approve submitted giving entries', 'sensitive'),
  ('giving.void', 'giving', 'void', 'Void giving', 'Void giving entries with reason', 'sensitive'),
  ('requests.view', 'requests', 'view', 'View requests', 'View member requests and forms queues', 'standard'),
  ('requests.manage', 'requests', 'manage', 'Manage requests', 'Update request status and staff notes', 'standard'),
  ('roles.view', 'roles', 'view', 'View roles', 'View staff role assignments', 'standard'),
  ('roles.assign_standard', 'roles', 'assign_standard', 'Assign standard roles', 'Assign non-sensitive staff roles', 'standard'),
  ('roles.assign_sensitive', 'roles', 'assign_sensitive', 'Assign sensitive roles', 'Assign sensitive staff roles', 'sensitive'),
  ('roles.revoke', 'roles', 'revoke', 'Revoke roles', 'Revoke staff role assignments', 'sensitive'),
  ('audit.view', 'audit', 'view', 'View audit', 'View audit and governance history', 'standard'),
  ('data.export', 'data', 'export', 'Export data', 'Export operational data', 'sensitive')
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.roles (
  role_key, display_name, description, role_category, is_sensitive
) VALUES
  ('platform_administrator', 'Platform Administrator', 'BlessBoard platform operations', 'platform', true),
  ('organisation_administrator', 'Organisation Administrator', 'Organisation-wide administration', 'organisation', true),
  ('church_system_administrator', 'Church System Administrator', 'Church HQ system administration', 'church', true),
  ('branch_pastor', 'Branch Pastor', 'Pastoral oversight for a branch', 'branch', true),
  ('branch_administrator', 'Branch Administrator', 'Branch operations administration', 'branch', false),
  ('ministry_leader', 'Ministry Leader', 'Ministry leadership (future scoped grants)', 'ministry', false),
  ('registration_officer', 'Registration Officer', 'Event and visitor registration', 'ministry', false),
  ('first_timers_coordinator', 'First Timers Coordinator', 'First-timers and orientation', 'ministry', false),
  ('classes_coordinator', 'Classes Coordinator', 'Foundation and establishment classes', 'ministry', false),
  ('cell_coordinator', 'Cell Coordinator', 'Cell network coordination', 'ministry', false),
  ('cell_leader', 'Cell Leader', 'Cell member care', 'ministry', false),
  ('department_head', 'Department Head', 'Department membership oversight', 'ministry', false),
  ('service_director', 'Service Director', 'Service schedule oversight', 'ministry', false),
  ('minister', 'Minister', 'Ministerial care escalation', 'pastoral', true),
  ('welfare_officer', 'Welfare Officer', 'Welfare assistance requests', 'pastoral', true),
  ('finance_director', 'Finance Director', 'Finance administration', 'finance', true),
  ('finance_officer', 'Finance Officer', 'Finance recording', 'finance', true),
  ('finance_approver', 'Finance Approver', 'Finance approvals', 'finance', true),
  ('communications_officer', 'Communications Officer', 'Organisation communications', 'communications', false),
  ('website_editor', 'Website Editor', 'Website content editing', 'website', false),
  ('website_publisher', 'Website Publisher', 'Website publication authority', 'website', true),
  ('auditor', 'Auditor', 'Read-only audit access', 'audit', true),
  ('member', 'Member', 'Active congregation member', 'member', false),
  ('visitor', 'Visitor', 'Unauthenticated or visiting principal', 'visitor', false)
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  role_category = EXCLUDED.role_category,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = true,
  updated_at = now();

-- Role → permission maps for roles that already have V5 module coverage.
-- Future ministry/pastoral-only roles intentionally have empty maps until later prompts.

-- church_system_administrator ≈ current HQ ops
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'church_system_administrator'
   AND p.permission_key IN (
     'organisation.view', 'organisation.settings.manage',
     'branches.view', 'branches.create', 'branches.edit', 'branches.archive',
     'members.view', 'members.create', 'members.edit', 'members.archive',
     'attendance.view', 'attendance.record',
     'events.view', 'events.manage',
     'website.view', 'website.edit', 'website.publish',
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void',
     'requests.view', 'requests.manage',
     'roles.view', 'roles.assign_standard', 'roles.assign_sensitive', 'roles.revoke',
     'audit.view'
   )
ON CONFLICT DO NOTHING;

-- organisation_administrator: org-wide ops without platform deployment powers
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'organisation_administrator'
   AND p.permission_key IN (
     'organisation.view', 'organisation.settings.manage',
     'branches.view', 'branches.create', 'branches.edit', 'branches.archive',
     'members.view', 'members.create', 'members.edit', 'members.archive',
     'attendance.view', 'attendance.record',
     'events.view', 'events.manage',
     'website.view', 'website.edit', 'website.publish',
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void',
     'requests.view', 'requests.manage',
     'roles.view', 'roles.assign_standard', 'roles.assign_sensitive', 'roles.revoke',
     'audit.view', 'data.export'
   )
ON CONFLICT DO NOTHING;

-- platform_administrator: preserve platform/HQ-capable ops; no pastoral-confidential keys exist yet
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'organisation.view', 'organisation.settings.manage',
     'branches.view', 'branches.create', 'branches.edit', 'branches.archive',
     'members.view', 'members.create', 'members.edit', 'members.archive',
     'attendance.view', 'attendance.record',
     'events.view', 'events.manage',
     'website.view', 'website.edit', 'website.publish',
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void',
     'requests.view', 'requests.manage',
     'roles.view', 'roles.assign_standard', 'roles.assign_sensitive', 'roles.revoke',
     'audit.view'
   )
ON CONFLICT DO NOTHING;

-- branch_administrator: branch ops; no giving.approve / roles.assign_* / data.export
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_administrator'
   AND p.permission_key IN (
     'organisation.view',
     'branches.view', 'branches.edit',
     'members.view', 'members.create', 'members.edit',
     'attendance.view', 'attendance.record',
     'events.view', 'events.manage',
     'website.view', 'website.edit', 'website.publish',
     'giving.view_summary', 'giving.record', 'giving.submit',
     'requests.view', 'requests.manage'
   )
ON CONFLICT DO NOTHING;

-- branch_pastor: same operational floor as branch admin for existing modules (pastoral extras later)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_pastor'
   AND p.permission_key IN (
     'organisation.view',
     'branches.view', 'branches.edit',
     'members.view', 'members.create', 'members.edit',
     'attendance.view', 'attendance.record',
     'events.view', 'events.manage',
     'website.view', 'website.edit',
     'giving.view_summary',
     'requests.view', 'requests.manage'
   )
ON CONFLICT DO NOTHING;

-- website_editor / website_publisher
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_editor'
   AND p.permission_key IN ('website.view', 'website.edit')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_publisher'
   AND p.permission_key IN ('website.view', 'website.edit', 'website.publish')
ON CONFLICT DO NOTHING;

-- auditor: read-only audit + summaries (no mutate / export by default)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'auditor'
   AND p.permission_key IN (
     'organisation.view', 'branches.view', 'members.view',
     'attendance.view', 'events.view', 'website.view',
     'giving.view_summary', 'requests.view', 'roles.view', 'audit.view'
   )
ON CONFLICT DO NOTHING;

-- finance roles: map only to existing giving module permissions
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_director'
   AND p.permission_key IN (
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void', 'data.export'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_officer'
   AND p.permission_key IN ('giving.view_summary', 'giving.record', 'giving.submit')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_approver'
   AND p.permission_key IN ('giving.view_summary', 'giving.approve')
ON CONFLICT DO NOTHING;

-- communications_officer
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'communications_officer'
   AND p.permission_key IN ('events.view', 'events.manage', 'website.view', 'website.edit')
ON CONFLICT DO NOTHING;
