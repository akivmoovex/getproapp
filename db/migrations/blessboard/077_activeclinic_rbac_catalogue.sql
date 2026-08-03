-- AC-V6-06: ActiveClinic foundational permissions and roles in shared catalogue.
-- Additive only. No BlessBoard assignment migration.

ALTER TABLE blessboard.roles
  DROP CONSTRAINT IF EXISTS roles_role_category_check;

ALTER TABLE blessboard.roles
  ADD CONSTRAINT roles_role_category_check
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
      'visitor',
      'activeclinic'
    ));

-- permission_key uniqueness is the catalogue identity; resource_key stays 'activeclinic'.
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.access', 'activeclinic', 'access',
   'Access ActiveClinic', 'Authenticate into ActiveClinic product surfaces', 'standard'),
  ('activeclinic.organization.view', 'activeclinic', 'view',
   'View ActiveClinic organization', 'View healthcare organization metadata', 'standard'),
  ('activeclinic.organization.manage', 'activeclinic', 'manage',
   'Manage ActiveClinic organization', 'Manage healthcare organization settings', 'sensitive'),
  ('activeclinic.facility.view', 'activeclinic', 'view',
   'View facilities', 'View facility catalogue within scope', 'standard'),
  ('activeclinic.facility.create', 'activeclinic', 'create',
   'Create facilities', 'Create facilities under healthcare organization', 'sensitive'),
  ('activeclinic.facility.update', 'activeclinic', 'update',
   'Update facilities', 'Update facility metadata within scope', 'standard'),
  ('activeclinic.facility.archive', 'activeclinic', 'archive',
   'Archive facilities', 'Archive facilities', 'sensitive'),
  ('activeclinic.staff.view', 'activeclinic', 'view',
   'View staff', 'View staff profiles within scope', 'standard'),
  ('activeclinic.staff.create', 'activeclinic', 'create',
   'Create staff', 'Create ActiveClinic staff profiles', 'sensitive'),
  ('activeclinic.staff.update', 'activeclinic', 'update',
   'Update staff', 'Update staff profiles within scope', 'standard'),
  ('activeclinic.staff.archive', 'activeclinic', 'archive',
   'Archive staff', 'Archive or suspend staff profiles', 'sensitive'),
  ('activeclinic.staff.assign_facility', 'activeclinic', 'assign_facility',
   'Assign staff facilities', 'Assign staff to facilities', 'sensitive'),
  ('activeclinic.staff.assign_access', 'activeclinic', 'assign_access',
   'Assign staff access', 'Assign ActiveClinic roles to staff', 'highly_sensitive'),
  ('activeclinic.audit.view', 'activeclinic', 'view',
   'View ActiveClinic audit', 'View ActiveClinic infrastructure audit events', 'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.roles (
  role_key, display_name, description, role_category, is_system, is_sensitive, is_active
) VALUES
  (
    'activeclinic_network_admin',
    'ActiveClinic Network Admin',
    'Organization-wide ActiveClinic administration',
    'activeclinic',
    true,
    true,
    true
  ),
  (
    'activeclinic_facility_admin',
    'ActiveClinic Facility Admin',
    'Facility-scoped ActiveClinic administration',
    'activeclinic',
    true,
    true,
    true
  ),
  (
    'activeclinic_staff',
    'ActiveClinic Staff',
    'Authenticated ActiveClinic access with assigned facility visibility',
    'activeclinic',
    true,
    false,
    true
  )
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.access',
     'activeclinic.organization.view',
     'activeclinic.organization.manage',
     'activeclinic.facility.view',
     'activeclinic.facility.create',
     'activeclinic.facility.update',
     'activeclinic.facility.archive',
     'activeclinic.staff.view',
     'activeclinic.staff.create',
     'activeclinic.staff.update',
     'activeclinic.staff.archive',
     'activeclinic.staff.assign_facility',
     'activeclinic.staff.assign_access',
     'activeclinic.audit.view'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.access',
     'activeclinic.organization.view',
     'activeclinic.facility.view',
     'activeclinic.facility.update',
     'activeclinic.staff.view',
     'activeclinic.staff.create',
     'activeclinic.staff.update',
     'activeclinic.staff.assign_facility'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_staff'
   AND p.permission_key IN (
     'activeclinic.access',
     'activeclinic.organization.view',
     'activeclinic.facility.view'
   )
ON CONFLICT DO NOTHING;
