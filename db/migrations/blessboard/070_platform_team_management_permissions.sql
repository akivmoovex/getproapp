-- Prompt 10D: Platform Admin organisation team-management permissions (additive).
-- Does not grant Finance transactions, pastoral bodies, or password-reset authority.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'platform.users.invite',
    'platform',
    'invite',
    'Invite platform users',
    'Invite or reuse BlessBoard staff users for a church organisation team',
    'sensitive'
  ),
  (
    'platform.roles.view',
    'platform',
    'view',
    'View platform team roles',
    'View organisation team staff access, RBAC roles, and effective-permission summaries',
    'sensitive'
  ),
  (
    'platform.roles.assign_standard',
    'platform',
    'assign_standard',
    'Assign standard platform team roles',
    'Assign standard (non-sensitive) RBAC roles within a church organisation team screen',
    'sensitive'
  ),
  (
    'platform.roles.assign_sensitive',
    'platform',
    'assign_sensitive',
    'Assign sensitive platform team roles',
    'Assign sensitive or highly sensitive RBAC roles within a church organisation team screen (reason required)',
    'highly_sensitive'
  ),
  (
    'platform.roles.revoke',
    'platform',
    'revoke',
    'Revoke platform team roles',
    'Revoke RBAC role assignments from organisation team management',
    'highly_sensitive'
  )
ON CONFLICT (permission_key) DO UPDATE
SET
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'platform.users.invite',
     'platform.roles.view',
     'platform.roles.assign_standard',
     'platform.roles.assign_sensitive',
     'platform.roles.revoke'
   )
ON CONFLICT DO NOTHING;
