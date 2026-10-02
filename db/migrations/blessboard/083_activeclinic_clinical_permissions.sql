-- AC-V6-P04: clinical permissions. Conservative defaults (network_admin + facility_admin only).

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.encounter.view', 'activeclinic', 'view',
   'View clinical encounters', 'View encounters and clinical queue for assigned facilities', 'highly_sensitive'),
  ('activeclinic.encounter.manage', 'activeclinic', 'manage',
   'Manage clinical encounters', 'Start, open, and close clinical encounters', 'highly_sensitive'),
  ('activeclinic.triage.record', 'activeclinic', 'record',
   'Record triage assessments', 'Record triage assessments and vital signs', 'highly_sensitive'),
  ('activeclinic.consultation.record', 'activeclinic', 'record',
   'Draft consultation notes', 'Create and edit draft consultation notes', 'highly_sensitive'),
  ('activeclinic.consultation.sign', 'activeclinic', 'sign',
   'Sign consultation notes', 'Sign (finalize) consultation notes', 'highly_sensitive'),
  ('activeclinic.clinical_order.create', 'activeclinic', 'create',
   'Create clinical orders', 'Create laboratory, prescription, and radiology orders', 'highly_sensitive'),
  ('activeclinic.clinical_alert.view', 'activeclinic', 'view',
   'View clinical alerts', 'View clinical escalation alerts', 'highly_sensitive'),
  ('activeclinic.clinical_alert.raise', 'activeclinic', 'raise',
   'Raise clinical alerts', 'Manually raise clinical escalation alerts', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.encounter.view',
     'activeclinic.encounter.manage',
     'activeclinic.triage.record',
     'activeclinic.consultation.record',
     'activeclinic.consultation.sign',
     'activeclinic.clinical_order.create',
     'activeclinic.clinical_alert.view',
     'activeclinic.clinical_alert.raise'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.encounter.view',
     'activeclinic.encounter.manage',
     'activeclinic.triage.record',
     'activeclinic.consultation.record',
     'activeclinic.consultation.sign',
     'activeclinic.clinical_order.create',
     'activeclinic.clinical_alert.view',
     'activeclinic.clinical_alert.raise'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default. Explicit assignment required for clinical permissions.
