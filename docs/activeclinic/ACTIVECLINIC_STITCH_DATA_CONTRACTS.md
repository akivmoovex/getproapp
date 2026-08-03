# ActiveClinic — Stitch Data Contracts (AC-V6-11)

Route handlers must not become the data contract. Prefer screen loaders that compose view models from services.

Statuses: `READY` · `SERVICE_GAP` · `REPOSITORY_GAP` · `SCHEMA_GAP` · `AUTHORIZATION_GAP` · `AUDIT_GAP` · `PRODUCT_DECISION`

---

## Existing service / repository inventory (code)

**Repositories:** `facilityRepository`, `healthcareOrganizationRepository`, `staffMemberRepository`, `staffAccessRepository`, `staffInvitationRepository` (+ platform identity repos).

**Services (selected):** auth, eligibility, facility, healthcare org, staff, staff facility, authorization, invitation, activation, password recovery, account admin, facility context, navigation, shell view model, share links, contact/key normalize.

---

## Foundation screen contracts

| Screen | Loader | Write service | Repo | Org / facility | Filters | Audit | Status |
|---|---|---|---|---|---|---|---|
| Login | n/a (form) | `authenticateActiveClinicIdentity` | platform identity | host product | — | login events | **READY** |
| Org select | eligibility list | session create | identity profile | multi-org | eligible only | session | **READY** |
| Activate | invitation + token | `activateActiveClinicStaff` | invitations + identity tokens | invitation org | — | activated | **READY** |
| Forgot / reset | token validate | recovery service | identity tokens | — | enumeration-safe | reset events | **READY** |
| Dashboard `/app` | `buildActiveClinicShellViewModel` | — | session | org + selected facility | — | — | **READY** (content placeholder) |
| Facilities list | `loadActiveClinicFacilitiesListScreen` | — | facility | org / assignment | q, type, status, primary | — | **READY** (AC-V6-S03; VISUAL_BLOCKED) |
| Facility detail | `loadActiveClinicFacilityDetailScreen` | — | facility | org + key | — | — | **READY** (AC-V6-S03; VISUAL_BLOCKED) |
| Facility create/edit | create/edit loaders | facilityService writes | facility | org (server-derived) | — | create/update audit | **READY** (AC-V6-S03; VISUAL_BLOCKED) |
| Facility archive / set-primary | detail actions | `archiveFacility` / `setPrimaryFacility` | facility | org | — | archive / set_primary audit | **READY** (AC-V6-S03) |
| Staff list | `loadActiveClinicStaffListScreen` | — | staff + assignments | org / facility | q, status, employment, facility, account | — | **READY** (AC-V6-S04; VISUAL_BLOCKED) |
| Staff detail | `loadActiveClinicStaffDetailScreen` | lifecycle via existing admin POSTs | staff + invitations + identity | org / facility | — | invite/credential audits | **READY** (AC-V6-S04; VISUAL_BLOCKED) |
| Staff create/invite | `loadActiveClinicCreateStaffScreen` | `inviteActiveClinicStaff` | invitations + staff | org / facility | — | invitation_issued | **READY** (AC-V6-S05; VISUAL_BLOCKED) |
| Staff edit | `loadActiveClinicEditStaffScreen` | `updateStaffMemberProfile` + facility sync | staff | org / facility | — | staff.update | **READY** (AC-V6-S05; VISUAL_BLOCKED) |
| Invite | — | `activeClinicStaffInvitationService` | invitations | org | — | invitation | **READY** (API + shell form) |
| Access overview | **propose** `loadAccessManagementScreen` | role assign (missing HTTP) | staffAccess | org/facility | — | role events | **SERVICE_GAP** |
| Settings | shell categories | org update missing HTTP | healthcare org | org | — | — | **SERVICE_GAP** |
| Select facility/org | context / eligibility | session context | sessions | staff-visible | — | context | **READY** |

---

## Proposed loader signatures (not implemented here)

```text
loadFacilitiesListScreen({ organizationId, statusFilter, search, page })
loadFacilityDetailScreen({ organizationId, facilityKey })
loadStaffListScreen({ organizationId, statusFilter, search, page })
loadStaffDetailScreen({ organizationId, staffId })
loadAccessManagementScreen({ organizationId, facilityId })
loadDashboardHomeScreen({ organizationId, facilityId, permissions })
```

Each returns a view model only — no raw SQL in routes.

---

## Clinical packages P02–P07

| Package | Schema | Repo | Service | Authz | Audit | Status |
|---|---|---|---|---|---|---|
| P02 Patients | missing | missing | missing | gap | gap | **SCHEMA_GAP** |
| P03 Appointments / queues | missing | missing | missing | gap | gap | **SCHEMA_GAP** |
| P04 Clinical | missing | missing | missing | gap | gap | **SCHEMA_GAP** + **PRODUCT_DECISION** |
| P05 Pharmacy | missing | missing | missing | gap | gap | **SCHEMA_GAP** |
| P06 Lab / imaging | missing | missing | missing | gap | gap | **SCHEMA_GAP** |
| P07 Billing | missing | missing | missing | gap | gap | **SCHEMA_GAP** + **PRODUCT_DECISION** |

Do not fabricate readiness from Stitch alone.

---

## Form / action contracts (foundation interactive)

### Create facility (proposed UI)

- Fields: `display_name`, `facility_key`, `facility_type`, `phone`, `email`, `location` (city/province/country), `timezone`, `is_primary`
- Required: display_name, facility_key, facility_type  
- Normalize: `normalizeFacilityKey`, contact normalize  
- Permission: `facility.create` · CSRF · org ownership  
- Success: redirect detail · Failure: re-render with errors  
- Concurrency: unique facility_key per org  

### Invite staff (service exists)

- Fields: `first_name`, `last_name`, `preferred_name`, `phone`, `email`, `job_title`, `employment_type`, facility assignments, role, invitation channel  
- Permissions: `staff.create` + `staff.invite`  
- Identity resolve order: explicit ID → unique verified phone → unique verified email → create; ambiguity = conflict  
- Success: activation URL panel (delivery not configured)  

### Activate

- Fields: password, confirm password  
- Token one-time · no session created · redirect `/login?activated=1`  

### Forgot / reset

- Public forgot: identifier only · always neutral message  
- Reset: password + confirm · revoke sessions on success  

Clinical forms are intentionally omitted until schemas exist.
