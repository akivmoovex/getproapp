-- Prompt 7B: Website Publisher must not inherit website.edit.
-- Publication authority is separate from draft editing (website.edit).
-- Does not alter migrations 057–066; additive correction to role_permissions only.

DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_key = 'website_publisher'
   AND p.permission_key = 'website.edit';
