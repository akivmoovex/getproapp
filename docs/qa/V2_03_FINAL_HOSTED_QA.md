# ActiveClinic V2.03 — Final Hosted QA

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_FINAL_HOSTED_QA` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Release SHA** | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| **Hosts** | `activeclinic.pronline.org`, `blessboard.pronline.org` |
| **Verdict** | **`V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED`** |
| **Production** | **NO** — not contacted for mutation; healthz-only identity check |

---

## 1. Release identity

| Item | Value | Result |
|------|--------|--------|
| Local `HEAD` | `0014616f6161b839344039ef7ed44cebeffb9f27` | PASS |
| `origin/V10` | `0014616f6161b839344039ef7ed44cebeffb9f27` | PASS |
| AC hosted `/healthz` `gitSha` | `0014616f6161` | PASS |
| BB hosted `/healthz` `gitSha` | `0014616f6161` | PASS |
| Deployment profile | `moovex-platform-testing` | PASS |
| Environment | `testing` | PASS |
| DB identity (expected) | `moovex-platform-v7` / `testing` | PASS (unchanged) |
| Session cookie | `moovex_platform_testing_sid` | observed |
| Schema | `schemaCompatible=true` | PASS |

Local baseline (precondition, tip-tested earlier): Batch 3 **11/0**, B1+B2 **41/0**, total **52/0**, RBAC/isolation local **PASS**.

---

## 2. Authenticated staff QA

**Fixtures:** documented demo QA role users on `activeclinic-demo` (`docs/activeclinic/ACTIVECLINIC_QA_ROLE_USERS.md`), shared testing password.

### Login / dashboard matrix (hosted)

| Role | `POST /login` | `GET /app` | Notes |
|------|---------------|------------|--------|
| `demo_organization_admin` | **500** | **500** | Error page “Something went wrong” |
| `demo_clinic_manager` | **500** | **500** | Same |
| `demo_facility_admin` | **500** | **500** | Same; also `/app/services` **500** |
| `demo_clinician` | 500 body on POST* | **200** | Shell + tokens + stamp `v2-03-b3-acn20-01` |
| `demo_receptionist` | 500 body on POST* | **200** | Patients/appointments OK |
| `demo_pharmacist` | 500 body on POST* | **200** | Pharmacy **200** |
| `demo_lab_technician` | 500 body on POST* | **200** | Diagnostics **200** |
| `demo_billing_officer` | 500 body on POST* | **200** | Billing **200**; cashier **403** (SoD) |
| `demo_cashier` | 500 body on POST* | **200** | Cashier **200**; patients **403** |

\*Login POST returns an error HTML body with status 500 for several roles even when a session cookie is established and subsequent `/app` succeeds for non-admin roles. Admin-class roles never recover.

### Clinician journey (authorized clinical role)

| Route | Result |
|-------|--------|
| `/app` dashboard | **200** — shell/tokens/stamp OK |
| `/app/patients` | **200** |
| `/app/appointments` (+ calendar/schedule) | **200** |
| `/app/facilities` | **200** |
| `/app/clinical` | **500** |
| `/app/clinical/follow-up` | **500** |
| `/app/clinical/referrals` (ACN20) | **500** |
| Encounter vitals / prescription (ACN17/ACN19) | **Blocked** — clinical workspace 500; cannot open leaf safely |
| Pharmacy / diagnostics / billing / cashier | **403** (expected RBAC) |

### Module coverage summary

| Area | Hosted result |
|------|----------------|
| Dashboard | **FAIL** for org/clinic/facility admin; **PASS** for clinician/reception/ops roles tested |
| Patients / appointments | **PASS** (clinician/receptionist) |
| Clinical encounter / ACN17 / ACN19 / ACN20 | **FAIL** (500) |
| Pharmacy / diagnostics / billing / cashier | **PASS** for respective authorized roles; **403** for others |
| Services / performance | **FAIL**/**403** — `/app/services` **500** for facility_admin; performance often **403** |
| Facilities/departments | Facilities list **200** for several roles; departments settings **403** where expected |

**Staff authenticated QA: FAIL** (P0 admin + clinical 500s).

---

## 3. Authenticated patient portal QA

| Check | Result |
|-------|--------|
| Login (`activeclinic-demo` linked patient) | **PASS** → dashboard |
| AC-P03 `/patient/bookings` | **PASS** — `data-ac-batch3="AC-P03"`, stamp `v2-03-b3-acp06-01` |
| AC-P04 booking detail | **LIMITED** — no linked booking fixture on the only passworded demo portal patient; route exists (auth redirect when logged out) |
| AC-P06 `/patient/invoices` | **PASS** — Batch 3 marker + stamp |
| AC-P07 `/patient/profile` | **PASS** — Batch 3 marker + stamp |
| AC-P05 visit-summaries | **404** — deferred (expected) |
| Cross-clinic (`julflona-clinic` while authed to demo) | **403** — no successful cross-tenant portal view |

**Patient portal QA: PASS** for available fixtures (AC-P03/06/07); AC-P04 detail not exercised for lack of booking row (P2 fixture gap, not product defect).

---

## 4–5. Batch 1 / Batch 2 representative regression

| Batch | Hosted outcome |
|-------|----------------|
| **Batch 1** | **FAIL** — clinical worklist 500; services 500 for facility_admin; admin dashboard 500 |
| **Batch 2** | **FAIL** — B2-06 clinical encounter path blocked by `/app/clinical` 500; B2-01/02/04/07/08/09/10 partially OK for authorized non-admin roles |

B2-03 remains intentionally absent (not a failure).

---

## 6. RBAC

| Evidence | Result |
|----------|--------|
| Local suite `activeclinic-batch2-rbac-isolation` (tip baseline) | PASS |
| Hosted: cashier vs billing SoD (cashier can cashier; billing_officer cashier **403**) | PASS |
| Hosted: clinician denied pharmacy/diagnostics/billing/cashier | PASS |
| Hosted: receptionist denied clinical/pharmacy/diagnostics/billing | PASS |
| Hosted: pharmacist denied clinical/billing | PASS |
| Hosted: lab tech diagnostics **200**, pharmacy **403** | PASS |

**RBAC: PASS** (representative hosted denials + local baseline). Admin/clinical **500** is not treated as an RBAC pass for those modules.

---

## 7. Isolation

| Check | Result |
|-------|--------|
| Local tenant/facility isolation suites (tip baseline) | PASS |
| Hosted patient portal cross-clinic | **403** | PASS |
| Hosted staff cross-tenant UI | Not fully re-proven under admin 500 outage; rely on local suite + portal probe |

**Tenant / facility / patient isolation: PASS** on evidence available (local + portal cross-clinic).

---

## 8. Responsive QA

| Surface | Evidence |
|---------|----------|
| Served `ac-app.css` / `ac-patient.css` | Contain Batch 3 `@media (max-width: 390px)` leaf hooks |
| Portal login/bookings/profile/invoices | Stamp + patient shell present |
| Staff dashboard/patients/appointments/facilities (clinician) | Shell/tokens load at desktop via authenticated GET |
| ACN17 / ACN19 / ACN20 hosted 390 | **Not verifiable** — clinical routes **500** |
| Mobile bottom nav 64px | Intentional — not changed |

**Responsive: FAIL** for full required matrix (clinical Batch 3 leaves unreachable). Non-clinical/portal surfaces show no evidence of new A/B regressions in HTML/CSS smoke.

---

## 9. Stitch parity confirmation

Local freeze: `V2_03_BATCH3_FINAL_PARITY_PASS` — no open A/B gaps; C/D/E/F documented.

Hosted: cannot confirm ACN17/19/20 rendering due to clinical **500**. Portal AC-P03/06/07 markers present. No new A/B fixes applied (none authorized in this gate).

**Stitch parity: FAIL** for hosted confirmation of clinical Batch 3 leaves; local parity record remains PASS.

---

## 10. Deferred scope

| Screen | Class | Hosted check |
|--------|-------|--------------|
| ACN18 | `DEFERRED_PRODUCT_BACKEND_SECURITY` | `/app/clinical/documents` → **404** |
| ACN27 | `DEFERRED_PRODUCT_BACKEND` | `/app/locations` → **404** |
| AC-P05 | `DEFERRED_PRODUCT_SECURITY` | `…/patient/visit-summaries` → **404** |

**Deferred: PASS** (absence is intentional, not a QA failure).

---

## 11. BlessBoard shared regression

| Check | Result |
|-------|--------|
| `/` | **200** |
| `/login` | **200**, form present, no 500 |
| Auth HQ (`qa.organisation_administrator@demo-church.example.test`) | **200** HQ shell |
| Shared SHA alignment | `0014616f6161` |

**BlessBoard shared regression: PASS** (limited).

---

## 12. Production safety

| Host | `gitSha` | Profile |
|------|---------|---------|
| `activeclinic.org` | `03a89106e2fe` | `moovex-platform-production` |
| `blessboard.com` | `03a89106e2fe` | `moovex-platform-production` |

**PRODUCTION TOUCHED: NO**

---

## 13. Issues

### P0 RELEASE_BLOCKER

1. **Admin-class `/app` 500** — `demo_organization_admin`, `demo_clinic_manager`, `demo_facility_admin`: authenticated `GET /app` returns **500** error page.  
   Reproduce: login as those QA emails on `activeclinic.pronline.org` → open `/app`.

2. **Clinical module 500** — authorized `demo_clinician`: `GET /app/clinical`, `/app/clinical/follow-up`, `/app/clinical/referrals` return **500**. Blocks Batch 2 clinical + Batch 3 ACN17/19/20 hosted QA.  
   Reproduce: login as `demo_clinician@demo.activeclinic.example` → open `/app/clinical`.

3. **Services 500** — `demo_facility_admin`: `GET /app/services` → **500** (Batch 1 representative).

### P1 RELEASE_BLOCKER

4. **Login POST returns 500 HTML** for multiple roles that still receive a usable session (clinician/reception/ops). Confusing failure mode adjacent to admin outage; treat as release blocker until classified/fixed with P0s.

### P2 NON_BLOCKING

5. AC-P04 detail not exercised — only one passworded demo portal patient and **zero** linked bookings in fixture.  
6. Historical freeze-doc working-tree rewrite remains excluded/stale (not part of release tip).

### P3 DEBT

7. Intentional deferred screens ACN18/ACN27/AC-P05.  
8. Intentional mobile bottom nav **64px**.  
9. Documented Stitch C/D/E/F gaps from final parity audit.

---

## 14. Gate decision

**Release blockers present (P0/P1).** Do not declare V2.03 release-candidate freeze PASS.

Marker: `V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED`
