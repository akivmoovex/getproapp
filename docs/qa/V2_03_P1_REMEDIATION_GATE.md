# V2.03 P1 Remediation Gate

**Verdict:** `V2_03_P1_GATE_PASS`  
**Date:** 2026-09-28  
**Worktree:** `getpro-v202-cov-audit`  
**Production:** **UNTOUCHED**  
**Authority:** overnight Prompt 2 — P1 targeted reproduction gate  
**Prior accounting:** ORIGINAL_FAILURES=452; RC01/02/03 eliminated=137; residual≈315; P1=18 / 5 RCs

---

## FINAL GATE

```text
P1_ORIGINAL=18
P1_REMAINING=0
V2_03_P1_GATE_PASS
```

```text
REAL_APPLICATION_DEFECTS=3
STALE_TESTS=8
FIXTURE_DRIFT=7
EXPECTED_DENIALS=0
OTHER=0

APPLICATION_FILES_CHANGED=3
TEST_FILES_CHANGED=8

RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
MEDIA_SECURITY_WEAKENED=NO
PATIENT_ISOLATION_WEAKENED=NO
FINANCE_AUTHZ_WEAKENED=NO
PRODUCTION=UNTOUCHED
```

---

## 1. Inventory — 5 P1 root causes (18 failures)

| ROOT_CAUSE | PRODUCT | FAILURE_COUNT | TEST_FILES | EXPECTED | ACTUAL | HTTP_STATUS | SECURITY/DATA RISK | ORIGINAL_REASON_FOR_P1 |
|---|---|---:|---|---|---|---|---|---|
| **RC14** Authz 403 vs allow/validate | AC / BB / Platform | 7 | `activeclinic-organization-settings-parity`, `activeclinic-roles-access-admin`, `activeclinic-roles-access-parity`, `blessboard-announcement-platform-admin-testing-policy`, `shared-website-editor-wave4b1` (×2), `v7-branch-editor-canonical-actions` | 400/303/200 | 403 | 403 | Authz surface — could be regression or seed | HTTP 403 where tests expected allow/redirect/validation |
| **RC19** AC booking↔patient linkage | ActiveClinic | 6 | `activeclinic-booking-patient-linkage` | `facility.ok===true` / linkage assertions | seed fail `false!==true` | n/a (service) | Patient linkage / isolation in same file | Booking↔patient assertions failing |
| **RC15** Tenant isolation | AC / BB / Platform | 3 | booking (cross-tenant), `blessboard-branch-mini-websites`, `v7-getpro-testing-foundation` | allow + deny / 404 / ok | seed fail / 301 / line mismatch | 301 / n/a | Isolation | Cross-tenant denial assertions |
| **RC20** AC finance mutation | ActiveClinic | 1 | `activeclinic-finance-rbac` | `created` | `invalid_input` | n/a (service) | Finance write path | Supervisor mutation mismatch |
| **RC16** Foreign org/branch 404 | BlessBoard | 1 | `blessboard-branch-mini-website-pages` | 404 | 301 | 301 | Isolation/UX contract | Foreign resource redirect vs 404 |

**Accounted:** 7+6+3+1+1 = **18**.

RC02/RC03 did **not** clear downstream P1 403s (`DOWNSTREAM_403` remaining=7 before this gate).

---

## 2. Reproduction + classification (per RC)

### RC14 (7) — mixed

| Leaf | Classification | Evidence |
|---|---|---|
| Org settings `403≠400` | **STALE_TEST_EXPECTATION** | POST body included forged `organization_id`; middleware correctly returns **403** `RBAC_FORGED_TENANT_ID` before validation 400 |
| Roles admin `403≠303` | **REAL_APPLICATION_DEFECT** | Org admin, `selectedFacility=null`, POST `facility_id` → forged denial. Legitimate in-tenant facility targeting blocked |
| Roles parity `403≠303` | **REAL_APPLICATION_DEFECT** | Same forged-facility unbound-session path |
| Announcements HTTP `403≠200` | **STALE_TEST_EXPECTATION** | Body: *Start an audited support session…* — platform admin must enter support mode; service-layer publish policy still valid |
| Media upload `403≠200` | **STALE_TEST_EXPECTATION** / URL contract | Org editor URL 301→branch; empty CSRF → `csrf` 403. Canonical `/c/:org/:branch` fixes |
| Cross-tenant media `403≠200` | **STALE_TEST_EXPECTATION** | Same org-level URL drift on upload setup |
| Branch history/styles/seo `403≠200` | **REAL_APPLICATION_DEFECT** | HQ path nulls `editorBranchId` for drafts; `requireEditor` authorized church-wide only → HQ `branch_admin` denied despite chrome 200 |

### RC19 (6) + RC15 booking (1)

| Classification | **TEST_FIXTURE_DRIFT** |
|---|---|
| Evidence | `nextPhone()` produced `+26097110001` (8 national digits) → `normalizeActiveClinicPhone` → `createFacility` `invalid_input` at seed L116. All 7 leaves fail before linkage logic. |
| After fixture fix | Linkage + **cross-tenant deny** assertions green |

### RC15 mini-web + host

| Leaf | Classification | Evidence |
|---|---|---|
| Unknown/foreign branch 404 | **CONTRACT_CHANGE** / stale URL | Legacy `/branches/` **301** → `/c/:org/:branchKey`; canonical unknown/foreign **404**; tenant host foreign may **503** V5 placeholder (not 200) |
| GetPro host isolation | **REAL_APPLICATION_DEFECT** (registry) | `getproapp.pronline.org` registered `platformLine=v7` while `moovex-platform-testing` is **v8** → `PLATFORM_LINE_HOST_MISMATCH` |

### RC20 (1)

| Classification | **STALE_TEST_EXPECTATION** / contract |
|---|---|
| Evidence | `recordPayment(MOBILE_MONEY)` requires `referenceNumber`; test omitted it → `invalid_input`. Cashier/refund authz paths already green; cross-tenant finance deny still green |

### RC16 (1)

| Classification | **CONTRACT_CHANGE** / stale URL |
|---|---|
| Evidence | Public foreign path `/c/stage5-b/branches/…` **301** to canonical; canonical **404**. No cross-org content leak |

### Announcements capability (triaged RC21 P2; fixed with gate)

| Classification | **STALE_TEST_EXPECTATION** |
|---|---|
| Evidence | Test used roleKey `platform_admin`; capability evaluator requires `platform_administrator` |

---

## 3. Security 401/403 case traces

### AC roles POST (was 403)

| Field | Value |
|---|---|
| ACTOR | Org admin staff (session platform_identity) |
| ROLE | `activeclinic_organization_admin` |
| TENANT | Seeded AC org |
| BRANCH/FACILITY | `facility_id` in body; `selectedFacility=null` |
| REQUIRED_PERMISSION | `activeclinic.staff.assign_access` |
| ACTUAL_PERMISSION | Present (GET assign 200) |
| EXPECTED_AUTHZ_RESULT | Allow assign (303) when facility in-tenant |
| ACTUAL_AUTHZ_RESULT | Middleware forged-tenant **403** before handler |

Trace: request → session OK → product AC OK → permission OK → **`rejectForgedTenantIdentifiers(facility_id)` fail** (trusted facility null) → 403.

**Fix:** unbound facility/branch client IDs skipped when trusted binding is null; org forgery still denied. Bound facility mismatch still denied.

### AC org settings POST (was 403≠400)

| Field | Value |
|---|---|
| ACTOR | Org admin with `activeclinic.organization.manage` |
| ACTUAL | Forged `organization_id` of other tenant → **403** (correct) |
| Test update | Separate forged→403 from validation→400; happy path without forged id |

### BB announcements HTTP (was 403)

| Field | Value |
|---|---|
| ACTOR | `platform_administrator` |
| REQUIRED | `announcements.view` (+ support context for `/hq`) |
| ACTUAL | Support middleware denial without audited support session |
| Fix | Test starts `startHqSupport` then exercises publish; production still denies publish by product policy |

### BB branch history (was 403)

| Field | Value |
|---|---|
| ACTOR | `branch_administrator` on HQ branch |
| REQUIRED | `website.edit` |
| ACTUAL | Authz with `branchId=null` (HQ draft scope) → permission denied |
| Fix | `requireEditor` retries authorize with HQ `resolved.branchId` when content scope is church-wide |

**Not solved by broadening roles/permissions.**

---

## 4. Tenant / isolation

| Case | Same-tenant | Cross-tenant |
|---|---|---|
| Booking patient link | Allowed after fixture fix | **Denied** (RC15 leaf green) |
| Finance payment/invoice | Supervisor writes OK with reference | Cross-tenant deny still green in suite |
| Mini-web foreign branch | Canonical **404** on apex | Tenant host non-200; resolver `NOT_FOUND` |
| Mini-website pages foreign org | Canonical **404** | Legacy **301** then 404 |
| GetPro env isolation | testing host OK after registry v8 | production host mismatch intact |

No SECURITY_DEFECT of cross-tenant allow observed after reproduction.

---

## 5–7. Domain notes

- **ActiveClinic booking/patient:** fixture phone drift only; workflow + persistence assertions pass after fix; patient/clinic isolation preserved.
- **Finance/billing:** reference required for mobile money; finance permissions unchanged; SoD negatives remain.
- **Announcements/media:** V2.02 purpose-scoped upload contract untouched (`website.edit` not reintroduced). HTTP PA path aligned with support-session gate. Media tests use canonical branch editor URLs.

---

## 8–9. Remediation

### Real application defects (RED → FIX → GREEN)

1. **Unbound facility forged false-positive** (`sharedTenantScope.js`)  
   - RED: roles assign 403 + new unit asserts in `v8-shared-rbac-tenant-isolation`  
   - FIX: skip facility/branch mismatch when trusted binding is null; keep org forgery + bound mismatch  
   - GREEN: roles admin/parity 303; forged org still denied  
   - NEGATIVE: unboundStillRejectsForgedOrg; bound facility mismatch still false

2. **HQ branch_admin website editor authz** (`blessboardWebsiteEditorRoutes.js`)  
   - RED: history/styles/seo 403 with `branchId:null`  
   - FIX: second authorize pass with HQ branch id  
   - GREEN: branch history leaf pass  
   - NEGATIVE: campus-only grants still cannot open other org; chrome remains branch-scoped

3. **GetPro host platformLine registry** (`canonicalHostRegistry.js`)  
   - RED: isolation leaf `ok.ok===false` (`PLATFORM_LINE_HOST_MISMATCH`)  
   - FIX: getpro hosts → `platformLine: "v8"` to match moovex platform profiles  
   - GREEN: production/testing isolation leaf pass  

### Stale / fixture / contract test updates

| Area | Change |
|---|---|
| Booking phones | `+2609########` canonical ZM format |
| Finance MOBILE_MONEY | pass `referenceNumber` |
| Org settings | forged org → 403; validation without forged id → 400 |
| Announcements capability | `platform_administrator` |
| Announcements HTTP | audited support session cookie |
| Media wave4b1 | canonical `/c/:org/:branchKey` + DB branch_key |
| Mini-web / pages | canonical URLs; legacy 301; isolation non-200 |

---

## 10. Final P1 gate rerun

Targeted leaf pattern covering all **18** original P1 failures + forged unbound regression + finance/booking isolation negatives:

```text
tests 19 (name-filtered leaves) / pass 19 / fail 0
P1_ORIGINAL=18
P1_REMAINING=0
```

Additional: capability unit 2/2; `rejects forged tenant identifiers by default` green (includes unbound facility regression).

Non-P1 failures still present in those files (RC08/RC10/RC23/RC26 cosmetics/URL/chrome) — **out of scope** for this gate (no RC10 CSS cleanup; no full 855).

---

## Files changed (this gate)

### APPLICATION

- `src/platform/rbac/sharedTenantScope.js`
- `src/blessboard/http/blessboardWebsiteEditorRoutes.js`
- `src/platform/config/canonicalHostRegistry.js`

### TEST

- `tests/v8-shared-rbac-tenant-isolation.test.js`
- `tests/activeclinic-booking-patient-linkage.test.js`
- `tests/activeclinic-finance-rbac.test.js`
- `tests/activeclinic-organization-settings-parity.test.js`
- `tests/blessboard-announcement-platform-admin-testing-policy.test.js`
- `tests/shared-website-editor-wave4b1.test.js`
- `tests/blessboard-branch-mini-websites.test.js`
- `tests/blessboard-branch-mini-website-pages.test.js`

### DOC

- `docs/qa/V2_03_P1_REMEDIATION_GATE.md` (this file)
- `docs/qa/V2_03_OVERNIGHT_STATE.md` (tracker update)

---

## Security posture checklist

| Flag | Value |
|---|---|
| RBAC_WEAKENED | **NO** |
| TENANT_ISOLATION_WEAKENED | **NO** |
| MEDIA_SECURITY_WEAKENED | **NO** |
| PATIENT_ISOLATION_WEAKENED | **NO** |
| FINANCE_AUTHZ_WEAKENED | **NO** |
| PRODUCTION | **UNTOUCHED** |

---

## Verdict

**V2_03_P1_GATE_PASS**
