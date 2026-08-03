-- AC-V6-C03: appointment permissions (catalogue only). Conservative defaults.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.appointment.view', 'activeclinic', 'view',
   'View appointments', 'View appointments within authorized facility scope', 'sensitive'),
  ('activeclinic.appointment.create', 'activeclinic', 'create',
   'Create appointments', 'Create administrative appointments', 'sensitive'),
  ('activeclinic.appointment.update', 'activeclinic', 'update',
   'Update appointments', 'Update appointment schedule details', 'sensitive'),
  ('activeclinic.appointment.cancel', 'activeclinic', 'cancel',
   'Cancel appointments', 'Cancel appointments with reason', 'sensitive'),
  ('activeclinic.appointment.check_in', 'activeclinic', 'check_in',
   'Check in appointments', 'Mark appointments checked in', 'sensitive'),
  ('activeclinic.appointment.manage_schedule', 'activeclinic', 'manage_schedule',
   'Manage appointment schedule', 'Manage service types and scheduling rules', 'highly_sensitive'),
  ('activeclinic.appointment.audit_view', 'activeclinic', 'audit_view',
   'View appointment audit', 'View appointment-related audit events', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.appointment.view',
     'activeclinic.appointment.create',
     'activeclinic.appointment.update',
     'activeclinic.appointment.cancel',
     'activeclinic.appointment.check_in',
     'activeclinic.appointment.manage_schedule',
     'activeclinic.appointment.audit_view'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.appointment.view',
     'activeclinic.appointment.create',
     'activeclinic.appointment.update',
     'activeclinic.appointment.cancel',
     'activeclinic.appointment.check_in'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default.
