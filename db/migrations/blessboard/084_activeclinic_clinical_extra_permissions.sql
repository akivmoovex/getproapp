-- AC-V6-P04 follow-up: nursing intake + diagnosis permissions (not in 083).

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.nursing_intake.record', 'activeclinic', 'record',
   'Record nursing intake', 'Record nursing intake notes for encounters', 'highly_sensitive'),
  ('activeclinic.diagnosis.record', 'activeclinic', 'record',
   'Record clinical diagnoses', 'Record diagnosis entries for encounters (manual entry only)', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('activeclinic_network_admin', 'activeclinic_facility_admin')
   AND p.permission_key IN (
     'activeclinic.nursing_intake.record',
     'activeclinic.diagnosis.record'
   )
ON CONFLICT DO NOTHING;
