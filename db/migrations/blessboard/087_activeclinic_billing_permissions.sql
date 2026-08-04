-- AC-V6-P07: billing/cashier permissions. Conservative defaults; elevated for refunds/reversals.

-- ============================================================================
-- BILLING PERMISSIONS
-- ============================================================================

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  -- Viewing
  ('activeclinic.billing.view', 'activeclinic', 'view',
   'View billing', 'View charge catalog, patient charges, and billing accounts', 'highly_sensitive'),
  
  -- Charging
  ('activeclinic.billing.charge', 'activeclinic', 'charge',
   'Create patient charges', 'Create and manage patient charges for services and procedures', 'highly_sensitive'),
  ('activeclinic.billing.charge.review', 'activeclinic', 'review',
   'Review automatic charges', 'Review and approve automatically captured charges', 'highly_sensitive'),
  
  -- Invoicing
  ('activeclinic.billing.invoice.create', 'activeclinic', 'create',
   'Create invoices', 'Create draft invoices from patient charges', 'highly_sensitive'),
  ('activeclinic.billing.invoice.post', 'activeclinic', 'post',
   'Post invoices', 'Finalize and post invoices (makes them immutable)', 'highly_sensitive'),
  ('activeclinic.billing.invoice.void', 'activeclinic', 'void',
   'Void posted invoices', 'Void posted invoices via financial reversal (elevated permission)', 'critical'),
  ('activeclinic.billing.invoice.amend', 'activeclinic', 'amend',
   'Amend invoices', 'Request and approve invoice amendments', 'highly_sensitive'),
  
  -- Price management
  ('activeclinic.billing.catalog.manage', 'activeclinic', 'manage',
   'Manage charge catalog', 'Create and update charge catalog items and price lists', 'highly_sensitive'),
  ('activeclinic.billing.price.override', 'activeclinic', 'override',
   'Override prices', 'Override catalog prices on individual charges (requires approval)', 'critical')

ON CONFLICT (permission_key) DO NOTHING;

-- ============================================================================
-- PAYMENT PERMISSIONS
-- ============================================================================

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.payment.view', 'activeclinic', 'view',
   'View payments', 'View payment history and receipts', 'highly_sensitive'),
  
  ('activeclinic.payment.collect', 'activeclinic', 'collect',
   'Collect payments', 'Record patient payments and generate receipts', 'highly_sensitive'),
  
  ('activeclinic.payment.refund', 'activeclinic', 'refund',
   'Process refunds', 'Request and approve payment refunds (elevated permission)', 'critical'),
  
  ('activeclinic.payment.reverse', 'activeclinic', 'reverse',
   'Reverse payments', 'Reverse posted payments via financial correction (elevated permission)', 'critical'),
  
  ('activeclinic.payment.allocate', 'activeclinic', 'allocate',
   'Allocate payments', 'Allocate payments to invoices (normally automatic)', 'highly_sensitive')

ON CONFLICT (permission_key) DO NOTHING;

-- ============================================================================
-- CASHIER PERMISSIONS
-- ============================================================================

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.cashier.open_session', 'activeclinic', 'open',
   'Open cashier session', 'Open daily cashier shift', 'highly_sensitive'),
  
  ('activeclinic.cashier.close_session', 'activeclinic', 'close',
   'Close cashier session', 'Close and reconcile cashier shift', 'highly_sensitive'),
  
  ('activeclinic.cashier.manage', 'activeclinic', 'manage',
   'Manage cashier operations', 'Full cashier management including variance review and history', 'highly_sensitive'),
  
  ('activeclinic.cashier.reconcile', 'activeclinic', 'reconcile',
   'Reconcile cashier sessions', 'Approve cashier session reconciliations and variances', 'critical')

ON CONFLICT (permission_key) DO NOTHING;

-- ============================================================================
-- REPORTING PERMISSIONS
-- ============================================================================

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('activeclinic.billing.reports.view', 'activeclinic', 'view',
   'View billing reports', 'View revenue reports and accounts receivable', 'highly_sensitive'),
  
  ('activeclinic.billing.reports.export', 'activeclinic', 'export',
   'Export billing reports', 'Export financial reports and data extracts', 'critical'),
  
  ('activeclinic.billing.corrections.view', 'activeclinic', 'view',
   'View financial corrections', 'View audit trail of refunds, reversals, and voids', 'highly_sensitive')

ON CONFLICT (permission_key) DO NOTHING;

-- ============================================================================
-- ROLE ASSIGNMENTS
-- ============================================================================

-- Network Admin: all billing/payment/cashier permissions
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_network_admin'
   AND p.permission_key IN (
     -- Billing
     'activeclinic.billing.view',
     'activeclinic.billing.charge',
     'activeclinic.billing.charge.review',
     'activeclinic.billing.invoice.create',
     'activeclinic.billing.invoice.post',
     'activeclinic.billing.invoice.void',
     'activeclinic.billing.invoice.amend',
     'activeclinic.billing.catalog.manage',
     'activeclinic.billing.price.override',
     -- Payment
     'activeclinic.payment.view',
     'activeclinic.payment.collect',
     'activeclinic.payment.refund',
     'activeclinic.payment.reverse',
     'activeclinic.payment.allocate',
     -- Cashier
     'activeclinic.cashier.open_session',
     'activeclinic.cashier.close_session',
     'activeclinic.cashier.manage',
     'activeclinic.cashier.reconcile',
     -- Reporting
     'activeclinic.billing.reports.view',
     'activeclinic.billing.reports.export',
     'activeclinic.billing.corrections.view'
   )
ON CONFLICT DO NOTHING;

-- Facility Admin: all billing/payment/cashier permissions
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'activeclinic_facility_admin'
   AND p.permission_key IN (
     -- Billing
     'activeclinic.billing.view',
     'activeclinic.billing.charge',
     'activeclinic.billing.charge.review',
     'activeclinic.billing.invoice.create',
     'activeclinic.billing.invoice.post',
     'activeclinic.billing.invoice.void',
     'activeclinic.billing.invoice.amend',
     'activeclinic.billing.catalog.manage',
     'activeclinic.billing.price.override',
     -- Payment
     'activeclinic.payment.view',
     'activeclinic.payment.collect',
     'activeclinic.payment.refund',
     'activeclinic.payment.reverse',
     'activeclinic.payment.allocate',
     -- Cashier
     'activeclinic.cashier.open_session',
     'activeclinic.cashier.close_session',
     'activeclinic.cashier.manage',
     'activeclinic.cashier.reconcile',
     -- Reporting
     'activeclinic.billing.reports.view',
     'activeclinic.billing.reports.export',
     'activeclinic.billing.corrections.view'
   )
ON CONFLICT DO NOTHING;

-- activeclinic_staff: intentionally unassigned by default.
-- Specific roles (cashier, billing clerk, finance manager) to be assigned per facility via role_grants.

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Elevated permissions (void, refund, reverse, reconcile, price override):
--    - Marked as 'critical' sensitivity
--    - Require explicit role assignment or approval workflow
--    - Should log to audit trail
--
-- 2. Cashier role profile (to be assigned per staff):
--    - payment.collect
--    - cashier.open_session
--    - cashier.close_session
--    - billing.view (read-only)
--
-- 3. Billing clerk role profile:
--    - billing.view
--    - billing.charge
--    - billing.invoice.create
--
-- 4. Finance manager role profile:
--    - All billing/payment permissions
--    - payment.refund
--    - billing.invoice.void
--    - billing.reports.export
--    - cashier.reconcile
--
-- 5. All financial permissions are tenant-scoped and subject to RLS enforcement.
