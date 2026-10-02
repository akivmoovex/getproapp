-- AC-V6: split laboratory vs radiology authorization (Prompt 9).
-- Idempotent. Does not modify identities, staff, facilities, or sessions.
-- Does not assign activeclinic.patient.merge.
--
-- Strategy (Option A + role remapping):
--   * New modality-specific keys: activeclinic.lab.* and activeclinic.radiology.*
--   * Generic activeclinic.diagnostics.view remains as hub/read aggregation for
--     admin/manager/auditor roles (opens both modality read routes).
--   * Generic diagnostics.collect / .result / .verify stop granting operational
--     access via role matrices (removed from technician roles).
--   * Lab technicians receive only lab.* ; radiology staff only radiology.*
--     (radiology has no specimen-collection workflow → no radiology.collect).

-- ---------------------------------------------------------------------------
-- 1. New permissions
-- ---------------------------------------------------------------------------
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.lab.view', 'activeclinic', 'view',
   'View laboratory', 'View laboratory requests, specimens, and results', 'highly_sensitive'),
  ('activeclinic.lab.collect', 'activeclinic', 'collect',
   'Collect laboratory specimens', 'Record specimen collection, receipt, and rejection', 'highly_sensitive'),
  ('activeclinic.lab.result', 'activeclinic', 'result',
   'Enter laboratory results', 'Enter laboratory diagnostic results', 'highly_sensitive'),
  ('activeclinic.lab.verify', 'activeclinic', 'verify',
   'Verify laboratory results', 'Verify and release laboratory results', 'highly_sensitive'),
  ('activeclinic.radiology.view', 'activeclinic', 'view',
   'View radiology', 'View radiology requests and reports', 'highly_sensitive'),
  ('activeclinic.radiology.result', 'activeclinic', 'result',
   'Enter radiology reports', 'Enter radiology diagnostic reports', 'highly_sensitive'),
  ('activeclinic.radiology.verify', 'activeclinic', 'verify',
   'Verify radiology reports', 'Verify and release radiology reports', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Helper: replace exact permission set for a role (same as 088)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION blessboard._ac_set_role_permissions(
  p_role_key text,
  p_permission_keys text[]
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id
    FROM blessboard.roles
   WHERE role_key = p_role_key
     AND role_category = 'activeclinic'
   LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'ActiveClinic role not found: %', p_role_key;
  END IF;

  DELETE FROM blessboard.role_permissions
   WHERE role_id = v_role_id;

  INSERT INTO blessboard.role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
    FROM blessboard.permissions p
   WHERE p.permission_key = ANY(p_permission_keys)
     AND p.is_active = true;

  IF (SELECT count(*) FROM blessboard.role_permissions WHERE role_id = v_role_id)
     <> cardinality(p_permission_keys) THEN
    RAISE EXCEPTION 'Permission key missing while assigning role %', p_role_key;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Laboratory technician — modality scoped (keeps verify for future routes)
-- ---------------------------------------------------------------------------
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_lab_technician',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.lab.view',
    'activeclinic.lab.collect',
    'activeclinic.lab.result',
    'activeclinic.lab.verify'
  ]
);

UPDATE blessboard.roles
   SET description = 'Laboratory diagnostics workflow (modality-scoped lab.* permissions).',
       updated_at = now()
 WHERE role_key = 'activeclinic_lab_technician';

-- ---------------------------------------------------------------------------
-- 4. Radiology staff — modality scoped (no collect action in workflow)
-- ---------------------------------------------------------------------------
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_radiology_staff',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.radiology.view',
    'activeclinic.radiology.result',
    'activeclinic.radiology.verify'
  ]
);

UPDATE blessboard.roles
   SET description = 'Radiology diagnostics workflow (modality-scoped radiology.* permissions; no specimen collection).',
       updated_at = now()
 WHERE role_key = 'activeclinic_radiology_staff';

-- ---------------------------------------------------------------------------
-- 5. Read-only / admin roles: keep diagnostics.view as hub aggregation only
--    (no transactional diagnostics.collect/result/verify on these roles).
--    Role matrices already view-only for diagnostics after 088 — reaffirm by
--    ensuring transactional generics are absent.
-- ---------------------------------------------------------------------------
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_category = 'activeclinic'
   AND r.role_key IN (
     'activeclinic_organization_admin',
     'activeclinic_network_admin',
     'activeclinic_facility_admin',
     'activeclinic_clinic_manager',
     'activeclinic_auditor'
   )
   AND p.permission_key IN (
     'activeclinic.diagnostics.collect',
     'activeclinic.diagnostics.result',
     'activeclinic.diagnostics.verify'
   );

-- Ensure diagnostics.view remains on read/admin roles that already have it
-- (no-op if present). Do not grant lab/radiology transactional keys.
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN (
     'activeclinic_organization_admin',
     'activeclinic_network_admin',
     'activeclinic_facility_admin',
     'activeclinic_clinic_manager',
     'activeclinic_auditor'
   )
   AND p.permission_key = 'activeclinic.diagnostics.view'
ON CONFLICT DO NOTHING;

-- Safety: patient.merge stays unassigned
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_category = 'activeclinic'
   AND p.permission_key = 'activeclinic.patient.merge';
