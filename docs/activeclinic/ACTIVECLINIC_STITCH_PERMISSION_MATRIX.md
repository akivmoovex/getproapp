# ActiveClinic — Stitch Permission Matrix (AC-V6-11)

Authorization uses **permission keys**, never role-name allowlists on routes.  
Subject: `activeclinic.staff_members`. Principal: `platform.identities`.

Catalogue sources: `db/migrations/blessboard/077_activeclinic_rbac_catalogue.sql`, `078_activeclinic_staff_lifecycle_permissions.sql`.

---

## Existing permissions (16)

| Permission | Typical use |
|---|---|
| `activeclinic.access` | Enter `/app` |
| `activeclinic.organization.view` | Read org context |
| `activeclinic.organization.manage` | Settings landing / org manage |
| `activeclinic.facility.view` | Facilities list/detail |
| `activeclinic.facility.create` | Create facility |
| `activeclinic.facility.update` | Edit / set primary |
| `activeclinic.facility.archive` | Archive facility |
| `activeclinic.staff.view` | Staff list/detail |
| `activeclinic.staff.create` | Create staff profile |
| `activeclinic.staff.update` | Update staff |
| `activeclinic.staff.archive` | Suspend/archive |
| `activeclinic.staff.assign_facility` | Facility assignments |
| `activeclinic.staff.assign_access` | Role assignments / access page |
| `activeclinic.audit.view` | Audit (no UI yet) |
| `activeclinic.staff.invite` | Invitations |
| `activeclinic.staff.manage_credentials` | Reset / unlock / revoke sessions |

Public auth lifecycle routes require **no** staff permission.

---

## Screen / action matrix (foundation)

| Screen/action | Route | Permission | Scope | Existing? | Proposed change |
|---|---|---|---|---|---|
| Login | `/login` | — | product host | yes | — |
| Org select | `/login/select-organization` | — | eligible orgs | yes | — |
| Activate / forgot / reset | lifecycle | — | token | yes | — |
| Change password | `/account/change-password` | authenticated identity | self | yes | — |
| Home / dashboard | `/app` | `activeclinic.access` | org | yes | — |
| Facilities list/detail | `/app/facilities…` | `facility.view` | org / assignment | yes | AC-V6-S03 functional |
| Create facility | `/app/facilities/new` + POST `/app/facilities` | `facility.create` | org | yes | AC-V6-S03 |
| Update facility | `…/edit` + POST `…/:facilityKey` | `facility.update` | org / assignment | yes | AC-V6-S03 |
| Archive facility | POST `…/archive` | `facility.archive` | org | yes | AC-V6-S03 |
| Set primary facility | POST `…/set-primary` | `facility.update` | org | yes | AC-V6-S03 |
| Staff list | `/app/staff` | `staff.view` | org / facility overlap | yes | AC-V6-S04 functional |
| Staff detail | `/app/staff/:staffId` | `staff.view` | org / facility overlap | yes | AC-V6-S04 functional |
| Invite staff | `/app/staff/new` + POST `/app/staff` | `staff.create` + `staff.invite` | org / facility | yes | AC-V6-S05 |
| Edit staff | `…/edit` + POST `…/:staffId` | `staff.update` | org / facility | yes | AC-V6-S05 |
| Assign facility | service | `staff.assign_facility` | org | yes | UI gap |
| Access overview | `/app/access` | `staff.assign_access` | org | yes | editor gap |
| Assign/revoke roles | proposed | `staff.assign_access` | org/facility | yes | add write routes |
| Credential admin | `/app/staff/:id/send-reset` etc. | `staff.manage_credentials` | org | yes | detail UI |
| Suspend/restore | staff admin POSTs | `staff.archive` / update | org | yes | detail UI |
| Settings | `/app/settings` | `organization.manage` | org | yes | — |
| Select facility/org | `/app/select-*` | authenticated | staff-visible | yes | — |

---

## Stitch clinical packages (P02–P07)

| Module | Minimum permission pattern | Existing? | Proposed change |
|---|---|---|---|
| Patients (P02) | `activeclinic.patient.*` | **no** | PERMISSION_GAP — defer until schema |
| Appointments / reception (P03) | `activeclinic.appointment.*`, `activeclinic.reception.*` | **no** | PERMISSION_GAP |
| Clinical (P04) | `activeclinic.encounter.*`, `activeclinic.clinical_note.*`, … | **no** | PERMISSION_GAP + SECURITY_REVIEW |
| Pharmacy (P05) | `activeclinic.pharmacy.*`, `activeclinic.medication.*` | **no** | PERMISSION_GAP |
| Lab / imaging (P06) | `activeclinic.lab.*`, `activeclinic.imaging.*` | **no** | PERMISSION_GAP + SECURITY_REVIEW |
| Billing (P07) | `activeclinic.billing.*` | **no** | PERMISSION_GAP |
| Shared Access Restricted | any denied path | n/a | render helper only |
| Offline / loading / error | n/a | n/a | chrome |

**Do not add clinical permissions in AC-V6-11.** Record gaps only.

---

## PERMISSION_GAP register

| Proposed key | Depends on screens | Notes |
|---|---|---|
| `activeclinic.patient.view/create/update` | P02 family | Blocked on patient schema |
| `activeclinic.appointment.view/manage` | P03 | Blocked on appointment model |
| `activeclinic.reception.manage` | Reception queue / check-in | May merge with appointment ops |
| `activeclinic.clinical.view/edit` | P04 | Confidentiality levels TBD |
| `activeclinic.pharmacy.dispense` | P05 dispense | Inventory + Rx coupling |
| `activeclinic.lab.result.enter` | P06 | Critical result alerts |
| `activeclinic.billing.charge` | P07 | Currency / insurance TBD |

No foundation Wave 1 permission additions required beyond what already exists.
