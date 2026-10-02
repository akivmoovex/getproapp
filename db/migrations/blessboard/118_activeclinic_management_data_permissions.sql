-- V2.03 ACN25/ACN26 — performance dashboard + import/export centre permissions.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.performance.view', 'activeclinic', 'view',
   'View clinic performance',
   'View aggregated clinic performance metrics (appointments, wait times, revenue). No clinical narratives.',
   'sensitive'),
  ('activeclinic.data.import', 'activeclinic', 'import',
   'Import clinic setup data',
   'Run ActiveClinic setup-data imports through the platform data-job framework',
   'highly_sensitive'),
  ('activeclinic.data.export', 'activeclinic', 'export',
   'Export clinic operational data',
   'Export patient lists, appointments, services, and financial summaries (facility-scoped, audited)',
   'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

-- Clinic managers + admins: performance + import/export
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
   AND p.permission_key IN (
     'activeclinic.performance.view',
     'activeclinic.data.import',
     'activeclinic.data.export'
   )
ON CONFLICT DO NOTHING;

-- Finance supervisor: performance (revenue) + export (financial summaries)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_finance_supervisor'
   AND p.permission_key IN (
     'activeclinic.performance.view',
     'activeclinic.data.export'
   )
ON CONFLICT DO NOTHING;

-- Auditor: performance view only
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_auditor'
   AND p.permission_key = 'activeclinic.performance.view'
ON CONFLICT DO NOTHING;
