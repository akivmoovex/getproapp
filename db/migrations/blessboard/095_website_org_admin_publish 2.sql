-- Organisation website administrators may publish and restore versions.
-- Platform Admin retains inspect / unpublish / suspend / restore powers.
-- Ordinary staff roles are unchanged.

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_organization_admin'
   AND p.permission_key IN (
     'website.publish',
     'website.rollback',
     'website.restore'
   )
ON CONFLICT DO NOTHING;
