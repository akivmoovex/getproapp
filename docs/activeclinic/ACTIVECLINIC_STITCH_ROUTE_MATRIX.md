# ActiveClinic — Stitch Route Matrix (AC-V6-11)

Canonical routes for Stitch screens and foundation admin surfaces.  
**Inventory:** [ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md](ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md)  
**Current code:** [ACTIVECLINIC_CURRENT_ROUTE_AUDIT.md](ACTIVECLINIC_CURRENT_ROUTE_AUDIT.md)

Legend: **exists** · **proposed** · **future (unimplemented)** · **STITCH_GAP** (backend/route without Stitch design)

Organization and facility identity stay in authenticated session context; avoid nesting `/org/:id/facility/:id` in URLs.

---

## A. Foundation — exists or proposed (Wave 1+)

| Screen / surface | Canonical route | Method | Params | Auth | Permission | Scope | Loader / service | Form action | Audit event | D/M |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 Login | `/login` | GET/POST | — | public | — | product host | `authenticateActiveClinicIdentity` | POST `/login` | login success/fail | D+M Stitch |
| Org select (login) | `/login/select-organization` | GET/POST | — | pending | — | multi-org | eligibility | POST select | session create | **STITCH_GAP** |
| Activate | `/activate/:token` | GET/POST | `token` | public | — | invitation | `activateActiveClinicStaff` | POST activate | `activeclinic.password.activated` | **STITCH_GAP** |
| Forgot password | `/forgot-password` | GET/POST | — | public | — | — | recovery (neutral) | POST forgot | `…password_reset.requested` | **STITCH_GAP** |
| Reset password | `/reset-password/:token` | GET/POST | `token` | public | — | — | complete reset | POST reset | `…password_reset.completed` | **STITCH_GAP** |
| Change password | `/account/change-password` | GET/POST | — | yes | — | identity | `changeActiveClinicPassword` | POST | password changed | **STITCH_GAP** |
| P01 Shell / drawer | `/app/*` chrome | — | — | yes | nav-filtered | session | `buildActiveClinicShellViewModel` | — | — | D+M Stitch |
| P01 Dashboard | `/app` | GET | — | yes | `activeclinic.access` | org | shell + home content | — | — | D+M Stitch |
| Shared loading/error/offline/restricted | chrome states | — | — | varies | — | — | taxonomy + `access-state` + error handler (AC-V6-S08) | — | — | D Stitch PARTIAL; offline deferred |
| Select facility | `/app/select-facility` | GET/POST | body `facilityId` | yes | auth | staff facilities | facility context service | POST + CSRF | session context | **STITCH_GAP** |
| Select organization (in-app) | `/app/select-organization` | GET/POST | body org | yes | auth | eligible orgs | eligibility + new session | POST + CSRF | session rotate | **STITCH_GAP** |
| Facilities list | `/app/facilities` | GET | `q,type,status,primary` | yes | `facility.view` | org / assignment | `loadActiveClinicFacilitiesListScreen` | — | — | **STITCH_GAP** functional (AC-V6-S03) |
| Facility detail | `/app/facilities/:facilityKey` | GET | `facilityKey` | yes | `facility.view` | org / assignment | `loadActiveClinicFacilityDetailScreen` | — | — | **STITCH_GAP** functional (AC-V6-S03) |
| Facility create | `/app/facilities/new` + POST `/app/facilities` | GET/POST | fields | yes | `facility.create` | org | create loader + `createFacility` | POST + CSRF | `activeclinic.facility.create` | **STITCH_GAP** functional (AC-V6-S03) |
| Facility edit | `/app/facilities/:facilityKey/edit` + POST `…/:facilityKey` | GET/POST | key | yes | `facility.update` | org / assignment | edit loader + `updateFacility` | POST + CSRF | `activeclinic.facility.update` | **STITCH_GAP** functional (AC-V6-S03) |
| Facility archive | POST `/app/facilities/:facilityKey/archive` | POST | key + confirm | yes | `facility.archive` | org | `archiveFacility` | POST + CSRF | `activeclinic.facility.archive` | **STITCH_GAP** functional (AC-V6-S03) |
| Set primary | POST `/app/facilities/:facilityKey/set-primary` | POST | key | yes | `facility.update` | org | `setPrimaryFacility` | POST + CSRF | `activeclinic.facility.set_primary` | **STITCH_GAP** functional (AC-V6-S03) |
| Staff list | `/app/staff` | GET | `q,status,employment,facility,account` | yes | `staff.view` | org / facility overlap | `loadActiveClinicStaffListScreen` | — | — | **STITCH_GAP** functional (AC-V6-S04) |
| Staff detail | `/app/staff/:staffId` | GET | id | yes | `staff.view` | org / facility overlap | `loadActiveClinicStaffDetailScreen` | lifecycle POSTs (existing) | — | **STITCH_GAP** functional (AC-V6-S04) |
| Staff create / invite UI | `/app/staff/new` + POST `/app/staff` | GET/POST | fields | yes | `staff.create` + `staff.invite` | org / facility | create loader + `inviteActiveClinicStaff` | POST + CSRF | `activeclinic.staff.invitation_issued` | **STITCH_GAP** functional (AC-V6-S05) |
| Staff edit | `/app/staff/:staffId/edit` + POST `…/:staffId` | GET/POST | fields | yes | `staff.update` (+ assign_facility) | org / facility | edit loader + `updateStaffMemberProfile` | POST + CSRF | `activeclinic.staff.update` | **STITCH_GAP** functional (AC-V6-S05) |
| Invite confirmation | create success (shell) | GET result | — | yes | create actor | org | invite result VM | — | — | **STITCH_GAP** functional (AC-V6-S05) |
| Access overview | `/app/access` | GET | `q,status,role,facility` | yes | `staff.assign_access` | org / facility overlap | `loadActiveClinicAccessOverviewScreen` | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S06; no Stitch design) |
| Staff access detail | `/app/access/staff/:staffId` | GET | id | yes | `staff.assign_access` | org / facility overlap | `loadActiveClinicStaffAccessDetailScreen` | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S06) |
| Assign role | `/app/access/staff/:staffId/assign` + POST `…/roles` | GET/POST | role/scope/facility/expiry | yes | `staff.assign_access` | org/facility | assign loader + `assignFoundationalStaffRole` | POST + CSRF | `activeclinic.staff.role_assign` | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S06) |
| Edit assignment | `/app/access/staff/:staffId/roles/:assignmentId/edit` + POST | GET/POST | expiry or replace | yes | `staff.assign_access` | org/facility | edit loader + expiry/replace services | POST + CSRF | expiry / revoke+assign | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S06) |
| Revoke assignment | GET/POST `…/roles/:assignmentId/revoke` | GET/POST | reason | yes | `staff.assign_access` | org/facility | revoke loader + `revokeFoundationalStaffRole` | POST + CSRF | `activeclinic.staff.role_revoked` | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S06) |
| Settings overview | `/app/settings` | GET | — | yes | `activeclinic.access` | org | `loadActiveClinicSettingsOverviewScreen` | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Organization profile | `/app/settings/organization` | GET | — | yes | `organization.view` | org | `loadHealthcareOrganizationSettingsScreen` | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Org settings write | `/app/settings/organization` (+ `/edit`) | GET/POST | fields | yes | `organization.manage` | org | edit loader + `updateHealthcareOrganizationSettings` | POST + CSRF | `activeclinic.healthcare_organization.update` | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Facility settings link | `/app/settings/facilities` | GET | — | yes | `facility.view` | org | summary + canonical facilities link | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Access settings link | `/app/settings/access` | GET | — | yes | `staff.assign_access` | org | redirect `/app/access` | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Account settings | `/app/settings/account` | GET | — | yes | auth | identity | account panel → password/logout | — | — | **functional COMPLETE / VISUAL_BLOCKED** (AC-V6-S07) |
| Logout | `/logout` | POST | — | cookie | — | — | revoke session | POST + CSRF | logout | — |

Staff admin JSON actions (invite reissue, reset, suspend, etc.) remain under `/app/staff/:staffId/…` as audited; HTML shells should eventually wrap them.

---

## B. Stitch clinical packages — future (do not implement routes yet)

| Package | Example Stitch screens | Proposed route prefix | Status |
|---|---|---|---|
| P02 Patients | Patient List, Register…, Profile, Print Card | `/app/patients` | **UI PARTIAL (AC-V6-C02)** — print deferred; VISUAL_BLOCKED vs full Stitch chrome |
| P03 Appointments / Reception | Calendar, Book, Queue, Check-In… | `/app/appointments`, `/app/reception` | **future** |
| P04 Clinical | Triage, Nursing Intake, Consultation, Rx/Lab/Rad requests | `/app/clinical`, `/app/triage` | **future** + SECURITY_REVIEW |
| P05 Pharmacy | Queue, Dispense, Inventory, Batches… | `/app/pharmacy` | **future** |
| P06 Lab / Imaging | Dashboards, queues, specimen, results | `/app/lab`, `/app/imaging` | **future** |
| P07 Billing | Dashboards, invoice, account | `/app/billing` | **future** |

Exact path trees for clinical modules are deferred until schemas and product decisions land. Screen-level paths will be added to this matrix when Wave 2+ backends exist.

---

## C. Temporary routes to retire before production polish

| Route | Action |
|---|---|
| `/__ac/*` | Keep production 404; remove when foundation probes unused |
| Invite-result standalone HTML | Replace with shell + staff detail when designed |

---

## D. Desktop / mobile relationship

| Pattern | Rule |
|---|---|
| Same route | Desktop and mobile share URL; CSS/shell adapt (`ac-app.css`, drawer) |
| Stitch pairs | Prefer `P0x – Name – Desktop/Mobile` as one family |
| Unprefixed Login/Dashboard/Shell | Reference duplicates of P01 — do not register alternate routes |


## AC-V6-S01 implementation note

`GET/POST /login` now renders Stitch-aligned auth shell (P01). Other foundation auth routes use the same layout; Stitch MATCHED only claimed for login composition (PARTIAL). See `stitch/AC_V6_S01_AUTHENTICATION_PARITY.md`.

## AC-V6-S02 note

`GET /app` uses `loadActiveClinicDashboardHome` with foundation-only summaries. Shell chrome shared across foundation routes.
