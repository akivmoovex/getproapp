-- AC-V6: narrow quick-register permission + role grants for patient registration model.
-- Does not assign activeclinic.patient.merge.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.patient.quick_register', 'activeclinic', 'quick_register',
   'Quick register patient',
   'Create a minimal patient record for urgent care; does not grant full registration or identifier management',
   'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

-- Nurse + clinician: quick register only (narrow)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'activeclinic_nurse',
     'activeclinic_clinician'
   )
   AND p.permission_key = 'activeclinic.patient.quick_register'
ON CONFLICT DO NOTHING;

-- Clinic manager: full register + demographics update (tenant-scoped; no merge)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_clinic_manager'
   AND p.permission_key IN (
     'activeclinic.patient.create',
     'activeclinic.patient.update',
     'activeclinic.patient.view_sensitive_contact'
   )
ON CONFLICT DO NOTHING;

-- Receptionist already has create/update; ensure quick_register is also available
-- so multi-role union and walk-in helpers remain consistent.
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_receptionist'
   AND p.permission_key = 'activeclinic.patient.quick_register'
ON CONFLICT DO NOTHING;
