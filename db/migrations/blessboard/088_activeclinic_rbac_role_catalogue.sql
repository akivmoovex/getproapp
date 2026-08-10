-- AC-V6 RBAC: expand ActiveClinic role catalogue and apply least-privilege matrices.
-- Additive roles; narrows facility_admin / network_admin permission sets in place.
-- Does NOT modify staff_role_assignments, identities, passwords, or sessions.
-- Does NOT assign activeclinic.patient.merge to any role.
-- Lab/radiology share diagnostics.* (modality split deferred).

-- ---------------------------------------------------------------------------
-- 1. Insert / normalize roles
-- ---------------------------------------------------------------------------
INSERT INTO blessboard.roles (
  role_key, display_name, description, role_category, is_system, is_sensitive, is_active
) VALUES
  (
    'activeclinic_organization_admin',
    'ActiveClinic Organization Administrator',
    'Tenant-owner administration: organization, facilities, staff, access, audit. No clinical or finance write by default.',
    'activeclinic', true, true, true
  ),
  (
    'activeclinic_clinic_manager',
    'ActiveClinic Clinic Manager',
    'Operational oversight and reporting with read-oriented access across departments.',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_receptionist',
    'ActiveClinic Receptionist',
    'Patient registration, appointments, and reception queue.',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_nurse',
    'ActiveClinic Nurse / Triage',
    'Triage, vitals, nursing intake, and encounter visibility.',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_clinician',
    'ActiveClinic Clinician / Doctor',
    'Consultations, diagnosis, clinical orders, and clinical documentation.',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_pharmacist',
    'ActiveClinic Pharmacist',
    'Prescription review, dispensing, and medication inventory.',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_lab_technician',
    'ActiveClinic Laboratory Technician',
    'Laboratory diagnostics workflow (shares diagnostics.* with radiology until modality split).',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_radiology_staff',
    'ActiveClinic Radiology Staff',
    'Radiology diagnostics workflow (shares diagnostics.* with laboratory until modality split).',
    'activeclinic', true, false, true
  ),
  (
    'activeclinic_billing_officer',
    'ActiveClinic Billing Officer',
    'Invoices, charges, and billing catalogue. No refunds or payment reversals.',
    'activeclinic', true, true, true
  ),
  (
    'activeclinic_cashier',
    'ActiveClinic Cashier',
    'Cashier sessions and payment collection. No refunds, reversals, or price overrides.',
    'activeclinic', true, true, true
  ),
  (
    'activeclinic_finance_supervisor',
    'ActiveClinic Finance Supervisor',
    'Elevated finance: voids, amendments, refunds, reversals, overrides, reconciliation.',
    'activeclinic', true, true, true
  ),
  (
    'activeclinic_auditor',
    'ActiveClinic Auditor',
    'Read-only audit and reporting visibility across ActiveClinic modules.',
    'activeclinic', true, true, true
  )
ON CONFLICT (role_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  role_category = 'activeclinic',
  is_system = true,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = true,
  updated_at = now();

UPDATE blessboard.roles
   SET display_name = 'ActiveClinic Network Admin (compat)',
       description = 'Backwards-compatible alias of Organization Administrator. Organization-wide admin without clinical/finance write.',
       is_system = true,
       is_sensitive = true,
       is_active = true,
       updated_at = now()
 WHERE role_key = 'activeclinic_network_admin';

UPDATE blessboard.roles
   SET display_name = 'ActiveClinic Facility Administrator',
       description = 'Facility-scoped administration: facility settings, staff, schedules, operational views. No clinical/finance write.',
       is_system = true,
       is_sensitive = true,
       is_active = true,
       updated_at = now()
 WHERE role_key = 'activeclinic_facility_admin';

UPDATE blessboard.roles
   SET display_name = 'ActiveClinic Staff',
       description = 'Minimal authenticated ActiveClinic access with facility visibility from assignments.',
       is_system = true,
       is_sensitive = false,
       is_active = true,
       updated_at = now()
 WHERE role_key = 'activeclinic_staff';

-- ---------------------------------------------------------------------------
-- 2. Helper: replace exact permission set for a role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION blessboard._ac_set_role_permissions(
  p_role_key TEXT,
  p_permission_keys TEXT[]
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM blessboard.role_permissions rp
   USING blessboard.roles r
   WHERE rp.role_id = r.id
     AND r.role_key = p_role_key;

  INSERT INTO blessboard.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM blessboard.roles r
    CROSS JOIN unnest(p_permission_keys) AS k(permission_key)
    JOIN blessboard.permissions p ON p.permission_key = k.permission_key
   WHERE r.role_key = p_role_key
  ON CONFLICT DO NOTHING;
END;
$$;

-- Organization Administrator (canonical)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_organization_admin',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.organization.manage',
    'activeclinic.facility.view',
    'activeclinic.facility.create',
    'activeclinic.facility.update',
    'activeclinic.facility.archive',
    'activeclinic.staff.view',
    'activeclinic.staff.create',
    'activeclinic.staff.update',
    'activeclinic.staff.archive',
    'activeclinic.staff.invite',
    'activeclinic.staff.assign_facility',
    'activeclinic.staff.assign_access',
    'activeclinic.staff.manage_credentials',
    'activeclinic.audit.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.archive',
    'activeclinic.patient.audit_view',
    'activeclinic.appointment.view',
    'activeclinic.appointment.manage_schedule',
    'activeclinic.appointment.audit_view',
    'activeclinic.reception.view',
    'activeclinic.reception.audit_view',
    'activeclinic.encounter.view',
    'activeclinic.clinical_alert.view',
    'activeclinic.pharmacy.view',
    'activeclinic.inventory.view',
    'activeclinic.pharmacy.audit_view',
    'activeclinic.diagnostics.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export'
  ]
);

-- Network Admin: mirror Organization Administrator (compat)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_network_admin',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.organization.manage',
    'activeclinic.facility.view',
    'activeclinic.facility.create',
    'activeclinic.facility.update',
    'activeclinic.facility.archive',
    'activeclinic.staff.view',
    'activeclinic.staff.create',
    'activeclinic.staff.update',
    'activeclinic.staff.archive',
    'activeclinic.staff.invite',
    'activeclinic.staff.assign_facility',
    'activeclinic.staff.assign_access',
    'activeclinic.staff.manage_credentials',
    'activeclinic.audit.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.archive',
    'activeclinic.patient.audit_view',
    'activeclinic.appointment.view',
    'activeclinic.appointment.manage_schedule',
    'activeclinic.appointment.audit_view',
    'activeclinic.reception.view',
    'activeclinic.reception.audit_view',
    'activeclinic.encounter.view',
    'activeclinic.clinical_alert.view',
    'activeclinic.pharmacy.view',
    'activeclinic.inventory.view',
    'activeclinic.pharmacy.audit_view',
    'activeclinic.diagnostics.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export'
  ]
);

-- Facility Administrator (narrowed)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_facility_admin',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.facility.update',
    'activeclinic.staff.view',
    'activeclinic.staff.create',
    'activeclinic.staff.update',
    'activeclinic.staff.invite',
    'activeclinic.staff.assign_facility',
    'activeclinic.staff.assign_access',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.appointment.view',
    'activeclinic.appointment.manage_schedule',
    'activeclinic.reception.view',
    'activeclinic.encounter.view',
    'activeclinic.pharmacy.view',
    'activeclinic.inventory.view',
    'activeclinic.diagnostics.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.billing.reports.view'
  ]
);

-- Clinic Manager
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_clinic_manager',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.staff.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.audit_view',
    'activeclinic.appointment.view',
    'activeclinic.appointment.audit_view',
    'activeclinic.reception.view',
    'activeclinic.reception.audit_view',
    'activeclinic.encounter.view',
    'activeclinic.clinical_alert.view',
    'activeclinic.pharmacy.view',
    'activeclinic.inventory.view',
    'activeclinic.pharmacy.audit_view',
    'activeclinic.diagnostics.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export',
    'activeclinic.audit.view'
  ]
);

-- Receptionist
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_receptionist',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.create',
    'activeclinic.patient.update',
    'activeclinic.patient.manage_identifiers',
    'activeclinic.patient.duplicate_override',
    'activeclinic.patient.view_sensitive_contact',
    'activeclinic.appointment.view',
    'activeclinic.appointment.create',
    'activeclinic.appointment.update',
    'activeclinic.appointment.cancel',
    'activeclinic.appointment.check_in',
    'activeclinic.reception.view',
    'activeclinic.reception.check_in',
    'activeclinic.reception.manage_queue',
    'activeclinic.reception.call_next',
    'activeclinic.reception.transfer',
    'activeclinic.reception.cancel'
  ]
);

-- Nurse / Triage
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_nurse',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.view_sensitive_contact',
    'activeclinic.appointment.view',
    'activeclinic.reception.view',
    'activeclinic.encounter.view',
    'activeclinic.triage.record',
    'activeclinic.nursing_intake.record',
    'activeclinic.clinical_alert.view',
    'activeclinic.clinical_alert.raise'
  ]
);

-- Clinician / Doctor
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_clinician',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.view_sensitive_contact',
    'activeclinic.appointment.view',
    'activeclinic.encounter.view',
    'activeclinic.encounter.manage',
    'activeclinic.consultation.record',
    'activeclinic.consultation.sign',
    'activeclinic.diagnosis.record',
    'activeclinic.clinical_order.create',
    'activeclinic.clinical_alert.view',
    'activeclinic.clinical_alert.raise'
  ]
);

-- Pharmacist
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_pharmacist',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.pharmacy.view',
    'activeclinic.pharmacy.review',
    'activeclinic.pharmacy.dispense',
    'activeclinic.inventory.view',
    'activeclinic.inventory.manage'
  ]
);

-- Laboratory Technician (shared diagnostics.* — modality split deferred)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_lab_technician',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.diagnostics.view',
    'activeclinic.diagnostics.collect',
    'activeclinic.diagnostics.result',
    'activeclinic.diagnostics.verify'
  ]
);

-- Radiology Staff (shared diagnostics.* — modality split deferred)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_radiology_staff',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.diagnostics.view',
    'activeclinic.diagnostics.collect',
    'activeclinic.diagnostics.result',
    'activeclinic.diagnostics.verify'
  ]
);

-- Billing Officer
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_billing_officer',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.billing.view',
    'activeclinic.billing.charge',
    'activeclinic.billing.charge.review',
    'activeclinic.billing.invoice.create',
    'activeclinic.billing.invoice.post',
    'activeclinic.billing.catalog.manage',
    'activeclinic.billing.corrections.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export',
    'activeclinic.payment.view'
  ]
);

-- Cashier
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_cashier',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.payment.collect',
    'activeclinic.payment.allocate',
    'activeclinic.cashier.open_session',
    'activeclinic.cashier.close_session'
  ]
);

-- Finance Supervisor
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_finance_supervisor',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.billing.view',
    'activeclinic.billing.charge',
    'activeclinic.billing.charge.review',
    'activeclinic.billing.invoice.create',
    'activeclinic.billing.invoice.post',
    'activeclinic.billing.invoice.void',
    'activeclinic.billing.invoice.amend',
    'activeclinic.billing.catalog.manage',
    'activeclinic.billing.price.override',
    'activeclinic.billing.corrections.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export',
    'activeclinic.payment.view',
    'activeclinic.payment.collect',
    'activeclinic.payment.allocate',
    'activeclinic.payment.refund',
    'activeclinic.payment.reverse',
    'activeclinic.cashier.open_session',
    'activeclinic.cashier.close_session',
    'activeclinic.cashier.manage',
    'activeclinic.cashier.reconcile'
  ]
);

-- Auditor (read-only)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_auditor',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view',
    'activeclinic.staff.view',
    'activeclinic.patient.view',
    'activeclinic.patient.search',
    'activeclinic.patient.audit_view',
    'activeclinic.appointment.view',
    'activeclinic.appointment.audit_view',
    'activeclinic.reception.view',
    'activeclinic.reception.audit_view',
    'activeclinic.encounter.view',
    'activeclinic.clinical_alert.view',
    'activeclinic.pharmacy.view',
    'activeclinic.inventory.view',
    'activeclinic.pharmacy.audit_view',
    'activeclinic.diagnostics.view',
    'activeclinic.billing.view',
    'activeclinic.payment.view',
    'activeclinic.billing.corrections.view',
    'activeclinic.billing.reports.view',
    'activeclinic.billing.reports.export',
    'activeclinic.audit.view'
  ]
);

-- Minimal staff base (unchanged set)
SELECT blessboard._ac_set_role_permissions(
  'activeclinic_staff',
  ARRAY[
    'activeclinic.access',
    'activeclinic.organization.view',
    'activeclinic.facility.view'
  ]
);

-- Safety: ensure patient.merge remains unassigned for ActiveClinic roles
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_category = 'activeclinic'
   AND p.permission_key = 'activeclinic.patient.merge';

DROP FUNCTION IF EXISTS blessboard._ac_set_role_permissions(TEXT, TEXT[]);
