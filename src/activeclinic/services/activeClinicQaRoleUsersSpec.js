"use strict";

/**
 * Standardized ActiveClinic QA role users for activeclinic-demo only.
 * Separate from departmental demo seed accounts (reception@, doctor@, …).
 */

const DEMO_CLINIC_KEY = "activeclinic-demo";

/**
 * Shared requested QA password from the mission brief.
 * Rejected by platform policy (min length 10) — seed aborts until a compliant
 * password is supplied via --password / options.
 */
const REQUESTED_QA_PASSWORD = "12345678";

/** Smallest policy-compliant shared QA password (length === 10). */
const RECOMMENDED_QA_PASSWORD = "1234567890";

const QA_ROLE_USERS = Object.freeze([
  {
    username: "demo_organization_admin",
    email: "demo_organization_admin@demo.activeclinic.example",
    displayName: "Demo Organization Admin",
    firstName: "Demo",
    lastName: "OrganizationAdmin",
    jobTitle: "Organization Administrator",
    roleKey: "activeclinic_organization_admin",
    scopeType: "organisation",
    phone: "+260900001001",
  },
  {
    username: "demo_network_admin",
    email: "demo_network_admin@demo.activeclinic.example",
    displayName: "Demo Network Admin",
    firstName: "Demo",
    lastName: "NetworkAdmin",
    jobTitle: "Network Administrator",
    roleKey: "activeclinic_network_admin",
    scopeType: "organisation",
    phone: "+260900001002",
    legacyNote: "LEGACY / COMPATIBILITY ROLE",
  },
  {
    username: "demo_facility_admin",
    email: "demo_facility_admin@demo.activeclinic.example",
    displayName: "Demo Facility Admin",
    firstName: "Demo",
    lastName: "FacilityAdmin",
    jobTitle: "Facility Administrator",
    roleKey: "activeclinic_facility_admin",
    scopeType: "facility",
    phone: "+260900001003",
  },
  {
    username: "demo_clinic_manager",
    email: "demo_clinic_manager@demo.activeclinic.example",
    displayName: "Demo Clinic Manager",
    firstName: "Demo",
    lastName: "ClinicManager",
    jobTitle: "Clinic Manager",
    roleKey: "activeclinic_clinic_manager",
    scopeType: "facility",
    phone: "+260900001004",
  },
  {
    username: "demo_receptionist",
    email: "demo_receptionist@demo.activeclinic.example",
    displayName: "Demo Receptionist",
    firstName: "Demo",
    lastName: "Receptionist",
    jobTitle: "Receptionist",
    roleKey: "activeclinic_receptionist",
    scopeType: "facility",
    phone: "+260900001005",
  },
  {
    username: "demo_nurse",
    email: "demo_nurse@demo.activeclinic.example",
    displayName: "Demo Nurse",
    firstName: "Demo",
    lastName: "Nurse",
    jobTitle: "Nurse",
    roleKey: "activeclinic_nurse",
    scopeType: "facility",
    phone: "+260900001006",
  },
  {
    username: "demo_clinician",
    email: "demo_clinician@demo.activeclinic.example",
    displayName: "Demo Clinician",
    firstName: "Demo",
    lastName: "Clinician",
    jobTitle: "Clinician",
    roleKey: "activeclinic_clinician",
    scopeType: "facility",
    phone: "+260900001007",
  },
  {
    username: "demo_pharmacist",
    email: "demo_pharmacist@demo.activeclinic.example",
    displayName: "Demo Pharmacist",
    firstName: "Demo",
    lastName: "Pharmacist",
    jobTitle: "Pharmacist",
    roleKey: "activeclinic_pharmacist",
    scopeType: "facility",
    phone: "+260900001008",
  },
  {
    username: "demo_lab_technician",
    email: "demo_lab_technician@demo.activeclinic.example",
    displayName: "Demo Lab Technician",
    firstName: "Demo",
    lastName: "LabTechnician",
    jobTitle: "Laboratory Technician",
    roleKey: "activeclinic_lab_technician",
    scopeType: "facility",
    phone: "+260900001009",
  },
  {
    username: "demo_radiology_staff",
    email: "demo_radiology_staff@demo.activeclinic.example",
    displayName: "Demo Radiology Staff",
    firstName: "Demo",
    lastName: "RadiologyStaff",
    jobTitle: "Radiology Staff",
    roleKey: "activeclinic_radiology_staff",
    scopeType: "facility",
    phone: "+260900001010",
  },
  {
    username: "demo_billing_officer",
    email: "demo_billing_officer@demo.activeclinic.example",
    displayName: "Demo Billing Officer",
    firstName: "Demo",
    lastName: "BillingOfficer",
    jobTitle: "Billing Officer",
    roleKey: "activeclinic_billing_officer",
    scopeType: "facility",
    phone: "+260900001011",
  },
  {
    username: "demo_cashier",
    email: "demo_cashier@demo.activeclinic.example",
    displayName: "Demo Cashier",
    firstName: "Demo",
    lastName: "Cashier",
    jobTitle: "Cashier",
    roleKey: "activeclinic_cashier",
    scopeType: "facility",
    phone: "+260900001012",
  },
  {
    username: "demo_finance_supervisor",
    email: "demo_finance_supervisor@demo.activeclinic.example",
    displayName: "Demo Finance Supervisor",
    firstName: "Demo",
    lastName: "FinanceSupervisor",
    jobTitle: "Finance Supervisor",
    roleKey: "activeclinic_finance_supervisor",
    scopeType: "facility",
    phone: "+260900001013",
  },
  {
    username: "demo_auditor",
    email: "demo_auditor@demo.activeclinic.example",
    displayName: "Demo Auditor",
    firstName: "Demo",
    lastName: "Auditor",
    jobTitle: "Auditor",
    roleKey: "activeclinic_auditor",
    scopeType: "organisation",
    phone: "+260900001014",
  },
  {
    username: "demo_staff",
    email: "demo_staff@demo.activeclinic.example",
    displayName: "Demo Staff",
    firstName: "Demo",
    lastName: "Staff",
    jobTitle: "General Staff",
    roleKey: "activeclinic_staff",
    scopeType: "organisation",
    phone: "+260900001015",
  },
]);

/** Existing demo seed emails that must remain untouched. */
const PRESERVED_DEMO_EMAILS = Object.freeze([
  "demo.admin@activeclinic.example",
  "reception@demo.activeclinic.example",
  "nurse@demo.activeclinic.example",
  "doctor@demo.activeclinic.example",
  "pharmacy@demo.activeclinic.example",
  "lab@demo.activeclinic.example",
  "radiology@demo.activeclinic.example",
  "billing@demo.activeclinic.example",
  "cashier@demo.activeclinic.example",
  "manager@demo.activeclinic.example",
  "finance@demo.activeclinic.example",
  "auditor@demo.activeclinic.example",
]);

const POSITIVE_PERMISSION_BY_ROLE = Object.freeze({
  activeclinic_organization_admin: "activeclinic.organization.manage",
  activeclinic_network_admin: "activeclinic.organization.manage",
  activeclinic_facility_admin: "activeclinic.facility.update",
  activeclinic_clinic_manager: "activeclinic.audit.view",
  activeclinic_receptionist: "activeclinic.patient.create",
  activeclinic_nurse: "activeclinic.triage.record",
  activeclinic_clinician: "activeclinic.consultation.record",
  activeclinic_pharmacist: "activeclinic.pharmacy.dispense",
  activeclinic_lab_technician: "activeclinic.lab.result",
  activeclinic_radiology_staff: "activeclinic.radiology.result",
  activeclinic_billing_officer: "activeclinic.billing.charge",
  activeclinic_cashier: "activeclinic.payment.collect",
  activeclinic_finance_supervisor: "activeclinic.payment.refund",
  activeclinic_auditor: "activeclinic.audit.view",
  activeclinic_staff: "activeclinic.access",
});

const NEGATIVE_PERMISSION_BY_ROLE = Object.freeze({
  activeclinic_organization_admin: "activeclinic.consultation.record",
  activeclinic_network_admin: "activeclinic.consultation.record",
  activeclinic_facility_admin: "activeclinic.pharmacy.dispense",
  activeclinic_clinic_manager: "activeclinic.payment.refund",
  activeclinic_receptionist: "activeclinic.consultation.record",
  activeclinic_nurse: "activeclinic.consultation.sign",
  activeclinic_clinician: "activeclinic.payment.collect",
  activeclinic_pharmacist: "activeclinic.diagnosis.record",
  activeclinic_lab_technician: "activeclinic.radiology.result",
  activeclinic_radiology_staff: "activeclinic.lab.result",
  activeclinic_billing_officer: "activeclinic.payment.refund",
  activeclinic_cashier: "activeclinic.payment.refund",
  activeclinic_finance_supervisor: "activeclinic.consultation.record",
  activeclinic_auditor: "activeclinic.payment.collect",
  activeclinic_staff: "activeclinic.patient.create",
});

module.exports = {
  DEMO_CLINIC_KEY,
  REQUESTED_QA_PASSWORD,
  RECOMMENDED_QA_PASSWORD,
  QA_ROLE_USERS,
  PRESERVED_DEMO_EMAILS,
  POSITIVE_PERMISSION_BY_ROLE,
  NEGATIVE_PERMISSION_BY_ROLE,
};
