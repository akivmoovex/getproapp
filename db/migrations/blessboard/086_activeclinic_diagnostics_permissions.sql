-- AC-V6-P06: diagnostics (laboratory/radiology) permissions.

INSERT INTO platform.permissions (name, description, created_at, updated_at)
VALUES
  (
    'diagnostics.view',
    'View laboratory and radiology requests, specimens, results, and reports',
    now(), now()
  ),
  (
    'diagnostics.collect',
    'Record specimen collection, receipt, and rejection',
    now(), now()
  ),
  (
    'diagnostics.result',
    'Enter laboratory results and radiology reports',
    now(), now()
  ),
  (
    'diagnostics.verify',
    'Verify and release laboratory results and radiology reports',
    now(), now()
  )
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      updated_at = now();

-- Grant diagnostics permissions to network admins and facility admins (default).
-- Clinical staff receive subset via role assignments.

DO $$
DECLARE
  perm_view_id UUID;
  perm_collect_id UUID;
  perm_result_id UUID;
  perm_verify_id UUID;
  network_admin_role_id UUID;
  facility_admin_role_id UUID;
BEGIN
  SELECT id INTO perm_view_id FROM platform.permissions WHERE name = 'diagnostics.view';
  SELECT id INTO perm_collect_id FROM platform.permissions WHERE name = 'diagnostics.collect';
  SELECT id INTO perm_result_id FROM platform.permissions WHERE name = 'diagnostics.result';
  SELECT id INTO perm_verify_id FROM platform.permissions WHERE name = 'diagnostics.verify';

  SELECT id INTO network_admin_role_id FROM platform.roles WHERE name = 'activeclinic_network_admin';
  SELECT id INTO facility_admin_role_id FROM platform.roles WHERE name = 'activeclinic_facility_admin';

  -- Network admin: all diagnostics permissions
  INSERT INTO platform.role_permissions (role_id, permission_id, created_at)
  VALUES
    (network_admin_role_id, perm_view_id, now()),
    (network_admin_role_id, perm_collect_id, now()),
    (network_admin_role_id, perm_result_id, now()),
    (network_admin_role_id, perm_verify_id, now())
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- Facility admin: all diagnostics permissions
  INSERT INTO platform.role_permissions (role_id, permission_id, created_at)
  VALUES
    (facility_admin_role_id, perm_view_id, now()),
    (facility_admin_role_id, perm_collect_id, now()),
    (facility_admin_role_id, perm_result_id, now()),
    (facility_admin_role_id, perm_verify_id, now())
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END;
$$;
