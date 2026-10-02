-- AC-V6-P05: pharmacy and inventory permissions. Conservative defaults.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.pharmacy.view', 'activeclinic', 'view',
   'View pharmacy queue', 'View pharmacy prescriptions, dispensing queue, and screens', 'highly_sensitive'),
  ('activeclinic.pharmacy.dispense', 'activeclinic', 'dispense',
   'Dispense medications', 'Dispense medications to patients and record dispense events', 'highly_sensitive'),
  ('activeclinic.pharmacy.review', 'activeclinic', 'review',
   'Review prescriptions', 'Perform pharmacist clinical review of complex prescriptions', 'highly_sensitive'),
  ('activeclinic.inventory.view', 'activeclinic', 'view',
   'View inventory', 'View medication inventory levels, batches, and alerts', 'sensitive'),
  ('activeclinic.inventory.manage', 'activeclinic', 'manage',
   'Manage inventory', 'Receive stock, adjust stock, transfer stock, manage medication catalogue', 'sensitive'),
  ('activeclinic.pharmacy.audit_view', 'activeclinic', 'audit_view',
   'View pharmacy audit', 'View pharmacy audit trail including stock movements and dispense history', 'highly_sensitive')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     'activeclinic.pharmacy.view',
     'activeclinic.pharmacy.dispense',
     'activeclinic.pharmacy.review',
     'activeclinic.inventory.view',
     'activeclinic.inventory.manage',
     'activeclinic.pharmacy.audit_view'
   )
ON CONFLICT DO NOTHING;

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     'activeclinic.pharmacy.view',
     'activeclinic.pharmacy.dispense',
     'activeclinic.pharmacy.review',
     'activeclinic.inventory.view',
     'activeclinic.inventory.manage'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default. Explicit assignment required for pharmacy permissions.
