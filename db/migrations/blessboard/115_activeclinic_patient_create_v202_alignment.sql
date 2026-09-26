-- V2.02 ActiveClinic patient.create alignment (owner decision).
-- Grant activeclinic.patient.create only to approved families:
--   reception: activeclinic_receptionist
--   clinical/records: activeclinic_medical_records_officer
--   clinic/organization management: clinic_manager, organization_admin, network_admin (compat)
-- Remove create from all other ActiveClinic roles (preserve patient.view where already granted).
-- Routes continue to authorize via permission + org/facility scope (no role-name allowlists).
-- Idempotent. Does not modify staff_role_assignments, identities, or sessions.

-- 1) Ensure approved management roles hold patient.create
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'activeclinic_organization_admin',
     'activeclinic_network_admin',
     'activeclinic_clinic_manager',
     'activeclinic_receptionist',
     'activeclinic_medical_records_officer'
   )
   AND p.permission_key = 'activeclinic.patient.create'
   AND p.is_active = true
   AND r.is_active = true
ON CONFLICT DO NOTHING;

-- 2) Strip patient.create from every ActiveClinic role outside the approved set
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_category = 'activeclinic'
   AND p.permission_key = 'activeclinic.patient.create'
   AND r.role_key NOT IN (
     'activeclinic_receptionist',
     'activeclinic_medical_records_officer',
     'activeclinic_clinic_manager',
     'activeclinic_organization_admin',
     'activeclinic_network_admin'
   );
