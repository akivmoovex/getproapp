-- Prompt 7: authorization migration permissions (additive).
-- Announcements/communications product keys + narrowly scoped audit views.
-- Does not alter legacy user_roles. Maps into RBAC catalogue + role_permissions.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('announcements.view', 'announcements', 'view', 'View announcements', 'View announcement admin queues', 'standard'),
  ('announcements.manage', 'announcements', 'manage', 'Manage announcements', 'Create and edit announcement drafts', 'standard'),
  ('announcements.publish', 'announcements', 'publish', 'Publish announcements', 'Publish or schedule announcements', 'sensitive'),
  ('broadcasts.view', 'broadcasts', 'view', 'View broadcasts', 'View HQ broadcast center', 'standard'),
  ('broadcasts.manage', 'broadcasts', 'manage', 'Manage broadcasts', 'Compose and manage broadcasts', 'sensitive'),
  ('audit.view_access', 'audit', 'view_access', 'View access audit', 'View RBAC assignment and access-denial metadata', 'sensitive'),
  ('audit.view_website', 'audit', 'view_website', 'View website audit', 'View website change and publish audit metadata', 'standard'),
  ('audit.view_finance', 'audit', 'view_finance', 'View finance audit', 'View finance/giving audit metadata (no bank details)', 'sensitive'),
  ('audit.view_pastoral_metadata', 'audit', 'view_pastoral_metadata', 'View pastoral audit metadata', 'View pastoral/welfare access metadata without note bodies', 'sensitive')
ON CONFLICT (permission_key) DO UPDATE
SET
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  is_active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Role maps (canonical catalogue)
-- ---------------------------------------------------------------------------

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('organisation_administrator', 'church_system_administrator', 'platform_administrator')
   AND p.permission_key IN (
     'announcements.view', 'announcements.manage', 'announcements.publish',
     'broadcasts.view', 'broadcasts.manage',
     'audit.view_access', 'audit.view_website', 'audit.view_finance', 'audit.view_pastoral_metadata'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_administrator'
   AND p.permission_key IN (
     'announcements.view', 'announcements.manage', 'announcements.publish',
     'audit.view_website'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'branch_pastor'
   AND p.permission_key IN ('announcements.view', 'announcements.manage')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'communications_officer'
   AND p.permission_key IN (
     'announcements.view', 'announcements.manage', 'announcements.publish',
     'broadcasts.view', 'broadcasts.manage'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_publisher'
   AND p.permission_key IN ('audit.view_website')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('finance_director', 'finance_approver', 'auditor')
   AND p.permission_key IN ('audit.view_finance')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'auditor'
   AND p.permission_key IN ('audit.view_access', 'audit.view_website', 'audit.view_pastoral_metadata')
ON CONFLICT DO NOTHING;
