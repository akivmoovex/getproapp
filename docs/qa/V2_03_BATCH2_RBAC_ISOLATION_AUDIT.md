# V2.03 Batch 2 — RBAC / Tenant / Facility Isolation Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH2_RBAC_ISOLATION_AUDIT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Scope** | Batch 2 authenticated staff screens — server-side authorization |
| **Mode** | Security regression only — no UI redesign |
| **Verdict** | `V2_03_BATCH2_RBAC_ISOLATION_PASS` |

---

## Goal

Prove Batch 2 Stitch screens do **not** weaken ActiveClinic security. UI hiding is **not** sufficient authorization.

For each applicable surface verify:

1. Authentication required  
2. ActiveClinic product access  
3. Tenant / org isolation  
4. Facility membership / scope  
5. Route authorization  
6. Action authorization  
7. Direct URL access  
8. Forged tenant / org / facility identifiers  
9. Restricted role behavior  

**Do not** weaken existing security to make Stitch actions work.

---

## Enforcement architecture (unchanged)

| Layer | Mechanism |
|-------|-----------|
| Auth | `createRequireActiveClinicAuth` — session + AC product principal |
| Permission | `createRequireActiveClinicPermission` — catalogue permission keys (not role-name allowlists) |
| Forged IDs | `rejectForgedTenantIdentifiers` on body/query/params vs trusted session org/facility |
| Facility scope | `auth.selectedFacility` from session context; resource queries filter by org + facility |
| Department gate | `createRequireActiveClinicDepartment` — lab vs radiology modality split |
| Cashier SoD | Collect routes require `activeclinic.payment.collect` / cashier session perms; billing officer catalogue lacks collect |

Trusted scope always comes from authentication — never from client-supplied org/facility IDs as authority.

---

## Screen matrix

| Screen / area | Auth | Product | Org isolation | Facility scope | Route perm | Action perm | Direct URL | Forged IDs | Restricted role | Result |
|---------------|------|---------|---------------|----------------|------------|-------------|------------|------------|-----------------|--------|
| AC-B2-01 Dashboard / shell | ✓ | ✓ | ✓ (session org) | ✓ selected facility | `activeclinic.access` + nav perms | N/A | ✓ | middleware | Restricted nav + 403 routes | **PASS** |
| AC-B2-02 Patients | ✓ | ✓ | ✓ cross-tenant | ✓ | patient.view | search/open scoped | ✓ | middleware | Staff without patient.view → 403 | **PASS** |
| AC-B2-04/05 Appointments | ✓ | ✓ | ✓ | ✓ | appointment perms | check-in gated | ✓ | middleware | No-appt role denied | **PASS** |
| AC-B2-06 Clinical encounter | ✓ | ✓ | ✓ cross-tenant 404/403 | ✓ | clinical view/record | save/complete gated | ✓ | middleware | Reception / billing / pharmacy denied | **PASS** |
| AC-B2-07 Pharmacy | ✓ | ✓ | ✓ queue scoped | ✓ + pharmacy dept | pharmacy.view | dispense gated | ✓ | middleware | Reception / billing → 403 | **PASS** |
| AC-B2-08 Lab | ✓ | ✓ | ✓ | ✓ + **laboratory** dept | diagnostics.* | collect/result | ✓ | middleware | Radiology staff / reception denied lab queue | **PASS** |
| AC-B2-08 Radiology | ✓ | ✓ | ✓ | ✓ + **radiology** dept | diagnostics.* | report | ✓ | middleware | Lab tech / reception denied rad queue | **PASS** |
| AC-B2-09 Billing | ✓ | ✓ | ✓ invoice cross-tenant | ✓ | billing.view / create | post/void/amend | ✓ | forged query 403 | Reception → 403; no collect UI | **PASS** |
| Cashier (SoD) | ✓ | ✓ | ✓ invoice by tenant+facility | ✓ | payment.collect | POST collect | ✓ | middleware | **Billing officer GET/POST collect → 403** | **PASS** |
| AC-B2-10 Departments | ✓ | ✓ | ✓ create resolves facility in org | ✓ | department.manage | create/update | ✓ | foreign facility_id → 403 | Reception / billing → 403 | **PASS** |
| AC-B2-10 Facilities | ✓ | ✓ | ✓ catalogue org-scoped | assignment-aware | facility.view | create/update/archive | ✓ | facilities parity | Reception may view; no dept manage | **PASS** |

---

## High-attention findings

### Clinical encounter
- Cross-tenant direct URL → **404/403** without narrative leak.  
- Receptionist, billing officer, pharmacist → **403** on encounter GET.  
- Covered by `activeclinic-batch2-clinical-encounter.test.js` + new isolation suite.

### Pharmacy / laboratory / radiology
- Pharmacy routes require pharmacy permissions; receptionist denied.  
- Lab vs radiology queues share diagnostics.* catalogue keys but are separated by **department middleware** (`laboratory` vs `radiology`) — not UI-only.  
- Covered by `activeclinic-batch2-operational-queues.test.js` + isolation suite.

### Billing / cashier SoD
- Billing officer **lacks** `activeclinic.payment.collect` in role catalogue.  
- Server returns **403** on `/app/cashier`, `/app/cashier/payment` GET, and POST collect — not merely hidden “Collect payment” buttons.  
- Cashier may open payment route (200) while billing cannot.  
- Regression test: `activeclinic-batch2-rbac-isolation.test.js` (“enforces billing/cashier SoD…”).

### Departments / facilities
- Department POST with foreign org `facility_id`, forged `organization_id`, or unknown facility UUID → **403** via forged-tenant middleware (and service facility resolution).  
- Query `?organization_id=` / mismatched `facility_id` → **403**.  
- Receptionist denied departments manage route.

### Forged identifiers
- Permission middleware rejects mismatched `organization_id` / `facility_id` in query or body against session trusted scope (`allowMatchingTrusted: true` only for exact match).

---

## Tests executed

| Suite | Result |
|-------|--------|
| `tests/activeclinic-batch2-rbac-isolation.test.js` (**new**) | **PASS** (4/4) |
| `tests/activeclinic-batch2-clinical-encounter.test.js` | **PASS** |
| `tests/activeclinic-batch2-operational-queues.test.js` | **PASS** |
| `tests/activeclinic-batch2-billing.test.js` | **PASS** |
| `tests/activeclinic-batch2-facilities.test.js` | **PASS** |
| `tests/activeclinic-batch2-patient-workspace.test.js` | **PASS** |
| `tests/activeclinic-batch2-appointments-workspace.test.js` | **PASS** |
| `tests/activeclinic-batch1a-billing.test.js` (cross-tenant + finance/clinical boundary) | **PASS** |
| `tests/v2-02-platform-rbac-foundation.test.js` | **PASS** |

### New suite coverage

1. Unauthenticated access → login redirect for all sensitive Batch 2 routes.  
2. Billing/cashier SoD — server 403 for billing officer on cashier collect GET/POST.  
3. Forged org/facility query + foreign facility department create → 403.  
4. Cross-tenant clinical + billing invoice isolation; pharmacy/diagnostics/departments role denials; lab↔radiology department boundary.

---

## Code changes

| Change | Purpose |
|--------|---------|
| `tests/activeclinic-batch2-rbac-isolation.test.js` | Fill Batch 2 security gaps (SoD, forged IDs, unauth, cross-tenant/role) |
| No production auth weakenings | Stitch UI remains permission-gated; catalogue SoD preserved |

---

## Residual notes (non-blocking)

1. Lab and radiology still share the same `diagnostics.*` permission keys in the catalogue; modality separation relies on department membership — intentional until a modality catalogue split.  
2. Finance supervisor retains both billing and cashier permissions by design (supervisor SoD exception).  
3. Pre-existing facilities parity tests already cover assignment-scoped facility lists and cross-tenant facility keys.

---

## Verdict

Batch 2 screens retain server-side authentication, permission, tenant, facility, department, forged-identifier, and cashier SoD controls. No security was weakened for Stitch parity. Additional isolation tests lock the critical paths.

**`V2_03_BATCH2_RBAC_ISOLATION_PASS`**
