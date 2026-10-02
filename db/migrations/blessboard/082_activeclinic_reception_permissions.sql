-- AC-V6-C05: reception/queue permissions. Conservative defaults.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.reception.view', 'activeclinic', 'view',
   'View reception queue', 'View reception arrivals and queue within facility scope', 'sensitive'),
  ('activeclinic.reception.check_in', 'activeclinic', 'check_in',
   'Check in patients', 'Check in scheduled and walk-in patients at reception', 'sensitive'),
  ('activeclinic.reception.manage_queue', 'activeclinic', 'manage_queue',
   'Manage queue entries', 'Create and manage queue entries for service points', 'sensitive'),
  ('activeclinic.reception.call_next', 'activeclinic', 'call_next',
   'Call next patient', 'Call the next patient in queue', 'sensitive'),
  ('activeclinic.reception.transfer', 'activeclinic', 'transfer',
   'Transfer queue entry', 'Transfer patient to different service point or facility', 'sensitive'),
  ('activeclinic.reception.cancel', 'activeclinic', 'cancel',
   'Cancel queue entry', 'Cancel or mark patient left before service', 'sensitive'),
  ('activeclinic.reception.audit_view', 'activeclinic', 'audit_view',
   'View reception audit', 'View reception and queue audit events', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.reception.view',
     'activeclinic.reception.check_in',
     'activeclinic.reception.manage_queue',
     'activeclinic.reception.call_next',
     'activeclinic.reception.transfer',
     'activeclinic.reception.cancel',
     'activeclinic.reception.audit_view'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.reception.view',
     'activeclinic.reception.check_in',
     'activeclinic.reception.manage_queue',
     'activeclinic.reception.call_next',
     'activeclinic.reception.transfer',
     'activeclinic.reception.cancel'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default.
