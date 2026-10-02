-- Prompt 10B: Platform Admin global users/members discovery permissions (additive).
-- Does not grant pastoral, welfare, or Finance transaction permissions.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'platform.users.view',
    'platform',
    'view',
    'View platform users',
    'Search and view BlessBoard staff-user directory across organisations (no secrets)',
    'sensitive'
  ),
  (
    'platform.members.search',
    'platform',
    'search',
    'Search platform members',
    'Search church members across organisations with safe field projection',
    'sensitive'
  ),
  (
    'platform.members.view_support_profile',
    'platform',
    'view_support_profile',
    'View member support profile',
    'View identity and support metadata for a member (no pastoral/Finance content)',
    'sensitive'
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
     'platform.users.view',
     'platform.members.search',
     'platform.members.view_support_profile'
   )
ON CONFLICT DO NOTHING;
