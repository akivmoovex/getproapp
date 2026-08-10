# ActiveClinic V6 — Foundational Permission Matrix

Permission keys live in shared `blessboard.permissions` (resource `activeclinic`).  
Routes/services must authorize by **permission key**, never by role name.

Catalogue migrations:

* `db/migrations/blessboard/088_activeclinic_rbac_role_catalogue.sql`
* `db/migrations/blessboard/089_activeclinic_diagnostics_modality_split.sql`

## Roles

| Role key | Scope | Notes |
|----------|--------|--------|
| `activeclinic_organization_admin` | Organisation | Canonical tenant admin (no clinical/finance write) |
| `activeclinic_network_admin` | Organisation | Compat alias of organization admin |
| `activeclinic_facility_admin` | Facility | Facility admin (narrowed — no clinical/finance write) |
| `activeclinic_clinic_manager` | Facility | Operational oversight / read-oriented |
| `activeclinic_receptionist` | Facility | Patients + appointments + reception |
| `activeclinic_nurse` | Facility | Triage + nursing intake |
| `activeclinic_clinician` | Facility | Consultation + diagnosis + orders |
| `activeclinic_pharmacist` | Facility | Pharmacy + inventory |
| `activeclinic_lab_technician` | Facility | Laboratory only (`activeclinic.lab.*`) |
| `activeclinic_radiology_staff` | Facility | Radiology only (`activeclinic.radiology.*`; no collect) |
| `activeclinic_billing_officer` | Facility | Invoices/charges; no refund/reverse |
| `activeclinic_cashier` | Facility | Collect payments; no refund/reverse/override |
| `activeclinic_finance_supervisor` | Facility | Elevated finance writes |
| `activeclinic_auditor` | Organisation | Read-only audit/reports |
| `activeclinic_staff` | Organisation or facility | Minimal shell access |

`activeclinic.patient.merge` remains **unassigned**.

## Diagnostics modality split (089)

* Operational keys: `activeclinic.lab.{view,collect,result,verify}` and
  `activeclinic.radiology.{view,result,verify}` (no `radiology.collect`).
* Legacy `activeclinic.diagnostics.view` is hub/read aggregation for admin,
  manager, and auditor (opens both modality **read** routes).
* Legacy `diagnostics.collect` / `.result` / `.verify` are not granted on
  technician or admin roles; routes authorize modality keys only.
* Separate lab/radiology tables + route trees enforce modality on writes.

## Financial segregation of duties (Prompt 10)

Role catalogue (088) already separates:

| Role | Collect / charge / invoice | Refund / reverse / void / override / reconcile |
|------|----------------------------|------------------------------------------------|
| Billing officer | charge, invoice create/post, catalog | No |
| Cashier | collect, allocate, open/close own session | No |
| Finance supervisor | elevated + collect/session | Yes |
| Org admin / manager / auditor | read/reports only | No |

Service-layer authorization uses `authorizeStaffPermission(pool, input)`.
Cashier may only close own session unless `cashier.manage`.

See `tests/activeclinic-finance-rbac.test.js`.

See `tests/activeclinic-rbac-role-matrix.test.js` and
`tests/activeclinic-diagnostics-rbac.test.js`.
