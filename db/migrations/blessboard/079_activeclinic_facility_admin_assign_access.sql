-- AC-V6-S06: Facility admins may assign foundational ActiveClinic roles within
-- facility scope. Privilege escalation remains enforced in the service layer
-- (network admin is not grantable by facility-scoped actors).

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key = 'activeclinic.staff.assign_access'
ON CONFLICT DO NOTHING;
