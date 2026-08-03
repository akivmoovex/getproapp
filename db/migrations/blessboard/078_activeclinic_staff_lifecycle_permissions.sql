-- AC-V6-09: ActiveClinic staff invitation + credential-management permissions.
-- Additive catalogue only. No BlessBoard assignment migration.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'activeclinic.staff.invite',
    'activeclinic',
    'invite',
    'Invite staff',
    'Issue and manage ActiveClinic staff activation invitations',
    'sensitive'
  ),
  (
    'activeclinic.staff.manage_credentials',
    'activeclinic',
    'manage_credentials',
    'Manage staff credentials',
    'Send password resets, revoke sessions, require password change, unlock temporary locks',
    'highly_sensitive'
  )
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.staff.invite',
     'activeclinic.staff.manage_credentials'
   )
ON CONFLICT DO NOTHING;

-- Facility admins may invite within their create/update scope; credential
-- management remains network-admin only by default.
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.staff.invite'
   )
ON CONFLICT DO NOTHING;
