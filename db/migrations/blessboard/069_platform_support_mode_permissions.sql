-- Prompt 10C: Platform Admin support-mode permissions (additive).
-- Does not grant Finance transactions, pastoral bodies, or safeguarding.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'platform.support.enter_hq',
    'platform',
    'enter_hq',
    'Enter HQ support mode',
    'Start a temporary audited support context for a church HQ portal',
    'sensitive'
  ),
  (
    'platform.support.enter_branch',
    'platform',
    'enter_branch',
    'Enter branch support mode',
    'Start a temporary audited support context for a branch admin portal',
    'sensitive'
  ),
  (
    'platform.support.exit',
    'platform',
    'exit',
    'Exit support mode',
    'End an active Platform Admin support context immediately',
    'sensitive'
  ),
  (
    'platform.support.view_status',
    'platform',
    'view_status',
    'View support mode status',
    'View the current Platform Admin support context status',
    'standard'
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
     'platform.support.enter_hq',
     'platform.support.enter_branch',
     'platform.support.exit',
     'platform.support.view_status'
   )
ON CONFLICT DO NOTHING;
