-- Additive website moderation permissions. resource_key = first segment,
-- action_key = last segment of permission_key.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('website.moderate', 'website', 'moderate',
   'Moderate websites', 'Flag content and request changes on tenant websites', 'sensitive'),
  ('website.take_offline', 'website', 'take_offline',
   'Take website offline', 'Take a tenant website offline without disabling the account', 'sensitive'),
  ('website.suspend', 'website', 'suspend',
   'Suspend website', 'Suspend a tenant website for governance without disabling the account', 'highly_sensitive'),
  ('website.restore', 'website', 'restore',
   'Restore website', 'Restore a website from offline/suspension or a prior version', 'sensitive'),
  ('website.manage_policy', 'website', 'manage_policy',
   'Manage website publishing policy', 'Set tenant website publishing policy', 'sensitive')
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_reviewer'
   AND p.permission_key IN ('website.moderate')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'website.moderate',
     'website.take_offline',
     'website.suspend',
     'website.restore',
     'website.manage_policy'
   )
ON CONFLICT DO NOTHING;
