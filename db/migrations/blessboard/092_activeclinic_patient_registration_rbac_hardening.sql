-- AC-V6: patient registration RBAC hardening (identifiers vs demographics).
-- Idempotent. Does not assign activeclinic.patient.merge.
-- Does not modify identities, sessions, or clinical data.

-- ---------------------------------------------------------------------------
-- 1. Medical Records Officer — elevated patient-record mandate
-- ---------------------------------------------------------------------------
INSERT INTO blessboard.roles (
  role_key, role_category, display_name, description, is_system, is_sensitive, is_active
) VALUES (
  'activeclinic_medical_records_officer',
  'activeclinic',
  'Medical Records Officer',
  'Patient registration, demographics, and authoritative identifier management. No clinical, pharmacy, diagnostics, billing, or staff administration rights.',
  true,
  false,
  true
)
ON CONFLICT (role_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      role_category = EXCLUDED.role_category,
      is_system = EXCLUDED.is_system,
      is_sensitive = EXCLUDED.is_sensitive,
      is_active = EXCLUDED.is_active,
      updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_medical_records_officer'
   AND p.permission_key IN (
     'activeclinic.access',
     'activeclinic.organization.view',
     'activeclinic.facility.view',
     'activeclinic.patient.view',
     'activeclinic.patient.search',
     'activeclinic.patient.create',
     'activeclinic.patient.update',
     'activeclinic.patient.manage_identifiers',
     'activeclinic.patient.duplicate_override',
     'activeclinic.patient.view_sensitive_contact'
   )
   AND p.is_active = true
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Receptionist: demographics registration only (no authoritative IDs)
-- ---------------------------------------------------------------------------
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_key = 'activeclinic_receptionist'
   AND p.permission_key IN (
     'activeclinic.patient.manage_identifiers',
     'activeclinic.patient.quick_register'
   );

-- ---------------------------------------------------------------------------
-- 3. Clinic Manager: explicitly do NOT grant manage_identifiers
--    (create/update already granted in 091; leave identifier editing elevated)
-- ---------------------------------------------------------------------------
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_key = 'activeclinic_clinic_manager'
   AND p.permission_key = 'activeclinic.patient.manage_identifiers';

-- ---------------------------------------------------------------------------
-- 4. Safety: patient.merge remains unassigned for ActiveClinic roles
-- ---------------------------------------------------------------------------
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_category = 'activeclinic'
   AND p.permission_key = 'activeclinic.patient.merge';
