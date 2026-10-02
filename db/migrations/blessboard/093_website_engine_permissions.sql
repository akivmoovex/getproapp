-- Shared website engine permissions (additive). Existing website.view/edit/publish preserved.
-- Constraint permissions_key_parts_match: resource_key = first segment, action_key = last segment.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('website.media.upload', 'website', 'upload',
   'Upload website media', 'Upload images and media references for a tenant website', 'standard'),
  ('website.submit', 'website', 'submit',
   'Submit website changes', 'Submit website drafts for platform review', 'standard'),
  ('website.review', 'website', 'review',
   'Review website submissions', 'Inspect and decide website change submissions', 'sensitive'),
  ('website.rollback', 'website', 'rollback',
   'Restore website versions', 'Restore a prior published website version into a new draft', 'sensitive'),
  ('website.manage_template', 'website', 'manage_template',
   'Manage website templates', 'Upgrade product website templates (platform-level)', 'sensitive')
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
    'website_reviewer',
    'Website Reviewer',
    'Platform content reviewer for tenant website submissions',
    'website',
    true,
    true,
    true
  ),
  (
    'activeclinic_website_editor',
    'Clinic Website Editor',
    'Edit and submit ActiveClinic tenant website drafts',
    'activeclinic',
    true,
    false,
    true
  )
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  role_category = EXCLUDED.role_category,
  is_system = true,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_editor'
   AND p.permission_key IN ('website.view', 'website.edit', 'website.media.upload', 'website.submit')
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_publisher'
   AND p.permission_key IN (
     'website.view', 'website.publish', 'website.review', 'website.rollback'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'website_reviewer'
   AND p.permission_key IN (
     'website.view', 'website.review', 'website.publish'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'website.view', 'website.edit', 'website.media.upload', 'website.submit',
     'website.review', 'website.publish', 'website.rollback', 'website.manage_template'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'organisation_administrator',
     'church_system_administrator'
   )
   AND p.permission_key IN (
     'website.view', 'website.edit', 'website.media.upload', 'website.submit',
     'website.publish', 'website.rollback'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_website_editor'
   AND p.permission_key IN (
     'activeclinic.access',
     'website.view', 'website.edit', 'website.media.upload', 'website.submit'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'activeclinic_organization_admin',
     'activeclinic_network_admin',
     'activeclinic_facility_admin'
   )
   AND p.permission_key IN (
     'website.view', 'website.edit', 'website.media.upload', 'website.submit'
   )
ON CONFLICT DO NOTHING;
