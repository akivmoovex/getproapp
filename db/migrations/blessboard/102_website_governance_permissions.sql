-- Post-publication website governance permissions and separate CSR grants.
-- Does not grant platform_admin. website.approve is secondary review only;
-- it never controls whether a customer website can initially go live.
-- website.audit.view is not added: website.review already covers the console.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'website.approve',
    'website',
    'approve',
    'Approve website version',
    'Record a non-blocking post-publication approval of a published website version',
    'sensitive'
  )
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.roles (
  role_key, display_name, description, role_category, is_system, is_sensitive, is_active
) VALUES
  (
    'platform_website_support',
    'Website support',
    'Review recently published customer websites without platform_admin',
    'website',
    true,
    true,
    true
  ),
  (
    'platform_website_approver',
    'Website approver',
    'Record post-publication website version approvals',
    'website',
    true,
    true,
    true
  ),
  (
    'platform_website_hider',
    'Website hider',
    'Hide a public website (offline) without suspending publishing',
    'website',
    true,
    true,
    true
  ),
  (
    'platform_website_blocker',
    'Website blocker',
    'Block a website (suspended) and prevent customer publishing',
    'website',
    true,
    true,
    true
  ),
  (
    'platform_website_restorer',
    'Website restorer',
    'Unhide, unblock, or revert a website to an approved version',
    'website',
    true,
    true,
    true
  )
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  role_category = EXCLUDED.role_category,
  is_system = true,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_website_support'
   AND p.permission_key IN ('website.view', 'website.review')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_website_approver'
   AND p.permission_key IN ('website.approve')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_website_hider'
   AND p.permission_key IN ('website.take_offline')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_website_blocker'
   AND p.permission_key IN ('website.suspend')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_website_restorer'
   AND p.permission_key IN ('website.restore')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key = 'website.approve'
ON CONFLICT DO NOTHING;
