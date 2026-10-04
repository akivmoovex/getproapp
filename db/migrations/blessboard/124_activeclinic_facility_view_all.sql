-- Separate organization-wide facility visibility from facility creation.
INSERT INTO blessboard.permissions
  (permission_key, resource_key, action_key, display_name, description, sensitivity)
VALUES
  ('activeclinic.facility.view_all', 'activeclinic', 'view_all',
   'View all facilities', 'View every facility in the healthcare organization', 'standard')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('activeclinic_organization_admin', 'activeclinic_network_admin')
   AND p.permission_key = 'activeclinic.facility.view_all'
ON CONFLICT DO NOTHING;
