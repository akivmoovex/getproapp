-- AC-V6-C01: ActiveClinic patient administrative permissions (catalogue only).
-- Conservative defaults: network + facility admin get administrative patient access;
-- activeclinic_staff receives none. Merge reserved and unassigned.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'activeclinic.patient.view',
    'activeclinic',
    'view',
    'View patients',
    'View minimized administrative patient profiles within authorized scope',
    'sensitive'
  ),
  (
    'activeclinic.patient.search',
    'activeclinic',
    'search',
    'Search patients',
    'Search patients within healthcare organization and facility scope',
    'sensitive'
  ),
  (
    'activeclinic.patient.create',
    'activeclinic',
    'create',
    'Register patients',
    'Register new administrative patient records',
    'sensitive'
  ),
  (
    'activeclinic.patient.update',
    'activeclinic',
    'update',
    'Update patients',
    'Update administrative patient demographics and contacts',
    'sensitive'
  ),
  (
    'activeclinic.patient.archive',
    'activeclinic',
    'archive',
    'Archive patients',
    'Archive or mark deceased administrative patient records',
    'highly_sensitive'
  ),
  (
    'activeclinic.patient.manage_identifiers',
    'activeclinic',
    'manage_identifiers',
    'Manage patient identifiers',
    'Add, update, and archive patient external identifiers',
    'highly_sensitive'
  ),
  (
    'activeclinic.patient.view_sensitive_contact',
    'activeclinic',
    'view_sensitive_contact',
    'View sensitive patient contact',
    'View unmasked phone, email, address, and emergency contacts',
    'highly_sensitive'
  ),
  (
    'activeclinic.patient.merge',
    'activeclinic',
    'merge',
    'Merge patients',
    'Reserved for future governed patient merge — not assigned in C01',
    'highly_sensitive'
  ),
  (
    'activeclinic.patient.audit_view',
    'activeclinic',
    'audit_view',
    'View patient audit',
    'View patient-related audit events',
    'highly_sensitive'
  ),
  (
    'activeclinic.patient.duplicate_override',
    'activeclinic',
    'duplicate_override',
    'Override duplicate patient warning',
    'Proceed with registration despite duplicate detection warning',
    'highly_sensitive'
  )
ON CONFLICT (permission_key) DO NOTHING;

-- Network admin: full administrative patient set except merge (deferred).
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.patient.view',
     'activeclinic.patient.search',
     'activeclinic.patient.create',
     'activeclinic.patient.update',
     'activeclinic.patient.archive',
     'activeclinic.patient.manage_identifiers',
     'activeclinic.patient.view_sensitive_contact',
     'activeclinic.patient.audit_view',
     'activeclinic.patient.duplicate_override'
   )
ON CONFLICT DO NOTHING;

-- Facility admin: registration/search within facility scope; no archive/merge/audit by default.
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.patient.view',
     'activeclinic.patient.search',
     'activeclinic.patient.create',
     'activeclinic.patient.update',
     'activeclinic.patient.manage_identifiers',
     'activeclinic.patient.view_sensitive_contact',
     'activeclinic.patient.duplicate_override'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned (conservative default).
-- activeclinic.patient.merge: intentionally unassigned to all roles.
