-- AC-V6-P06: diagnostics (laboratory/radiology) permissions. Conservative defaults.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.diagnostics.view', 'activeclinic', 'view',
   'View diagnostics', 'View laboratory and radiology requests, specimens, results, and reports', 'highly_sensitive'),
  ('activeclinic.diagnostics.collect', 'activeclinic', 'collect',
   'Collect diagnostic specimens', 'Record specimen collection, receipt, and rejection', 'highly_sensitive'),
  ('activeclinic.diagnostics.result', 'activeclinic', 'result',
   'Enter diagnostic results', 'Enter laboratory results and radiology reports', 'highly_sensitive'),
  ('activeclinic.diagnostics.verify', 'activeclinic', 'verify',
   'Verify diagnostic results', 'Verify and release laboratory results and radiology reports', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.diagnostics.view',
     'activeclinic.diagnostics.collect',
     'activeclinic.diagnostics.result',
     'activeclinic.diagnostics.verify'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.diagnostics.view',
     'activeclinic.diagnostics.collect',
     'activeclinic.diagnostics.result',
     'activeclinic.diagnostics.verify'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default.
