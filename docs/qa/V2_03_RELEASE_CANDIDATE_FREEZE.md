# ActiveClinic V2.03 — Release Candidate Freeze

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_RELEASE_CANDIDATE_FREEZE` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Intended release SHA** | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| **Hosted QA record** | `docs/qa/V2_03_FINAL_HOSTED_QA.md` |
| **Verdict** | **`V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED`** |
| **Push / deploy / production** | **Not performed** |

---

## Freeze identity

| Item | Value |
|------|--------|
| Local / origin SHA | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| AC / BB pronline SHA | `0014616f6161` (aligned) |
| Deployment | `moovex-platform-testing` / `testing` |
| DB identity | `moovex-platform-v7` / `testing` (unchanged) |
| Production | `03a89106e2fe` / `moovex-platform-production` — **untouched** |

---

## Scope status

| Stream | Status |
|--------|--------|
| **Batch 1** | **FAIL** on hosted (admin dashboard / services / clinical 500s) |
| **Batch 2** | **FAIL** on hosted (clinical B2-06 path 500; other modules partial PASS) |
| **Batch 3 implemented** | Portal leaves host-OK; clinical leaves **blocked** by clinical 500 |
| **Batch 3 deferred** | ACN18 / ACN27 / AC-P05 — intentional; **PASS** as deferred |
| Local automated baseline | 52 PASS / 0 FAIL (prior tip evidence) |

### Implemented Batch 3 (code tip)

ACN17, ACN19, ACN20, AC-P03, AC-P04, AC-P06, AC-P07

### Deferred (not failures)

| Code | Class |
|------|-------|
| ACN18 | `DEFERRED_PRODUCT_BACKEND_SECURITY` |
| ACN27 | `DEFERRED_PRODUCT_BACKEND` |
| AC-P05 | `DEFERRED_PRODUCT_SECURITY` |

---

## QA gates

| Gate | Result |
|------|--------|
| Staff authenticated QA | **FAIL** |
| Patient portal QA | **PASS** (AC-P03/06/07; AC-P04 fixture-limited) |
| RBAC | **PASS** (representative) |
| Tenant isolation | **PASS** |
| Facility isolation | **PASS** (local + limited hosted) |
| Patient isolation | **PASS** |
| Responsive | **FAIL** (clinical leaves unreachable) |
| Stitch parity (hosted confirm) | **FAIL** for ACN17/19/20; local parity record PASS |
| BlessBoard shared regression | **PASS** |

---

## Release blockers (exact)

**P0**

1. Hosted `GET /app` → **500** for `demo_organization_admin`, `demo_clinic_manager`, `demo_facility_admin` on SHA `0014616f6161`.  
2. Hosted `GET /app/clinical`, `/app/clinical/follow-up`, `/app/clinical/referrals` → **500** for authorized `demo_clinician`.  
3. Hosted `GET /app/services` → **500** for `demo_facility_admin`.

**P1**

4. Hosted `POST /login` returns **500** error HTML for multiple roles that still establish a session (masks failures; couples to admin outage).

Until P0/P1 are fixed and re-verified on pronline at this SHA (or a successor tip), **V2.03 is not a release candidate**.

---

## Known non-blocking gaps

- AC-P04 detail not exercised (no booking on sole passworded demo portal patient).  
- Stitch C/D/E/F gaps from `V2_03_BATCH3_FINAL_PARITY_AUDIT.md`.  
- Mobile bottom nav 64px intentional.  
- Deferred ACN18/ACN27/AC-P05.

---

## Decision

**`V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED`**

Do **not** push further changes as “RC”. Do **not** deploy to production. Continue on testing only after clinical/admin 500 root-cause fix.
