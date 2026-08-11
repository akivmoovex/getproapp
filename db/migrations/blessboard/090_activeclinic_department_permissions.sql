-- AC-V6: clinic department configuration permission (narrow; additive).

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.departments.manage', 'activeclinic', 'manage',
   'Manage clinic departments',
   'Configure which operational departments exist at a facility (activate/deactivate; no hard delete of clinical history)',
   'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

-- Network / org / facility admin + clinic manager
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'activeclinic_network_admin',
     'activeclinic_organization_admin',
     'activeclinic_facility_admin',
     'activeclinic_clinic_manager'
   )
   AND p.permission_key = 'activeclinic.departments.manage'
ON CONFLICT DO NOTHING;
