# V10 PC23 — V2.03 Post-Consolidation QA Readiness

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC23_V2_03_POST_CONSOLIDATION_QA_READINESS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC17–PC22 complete; no P0/P1 architecture blocker |
| **Mode** | Broad regression + classify; **no** further architecture refactor; **no** production deploy |
| **Fix policy** | Only clear consolidation-caused P0/P1 regressions |
| **Verdict** | **`V2_03_POST_CONSOLIDATION_QA_READY_WITH_P2_GAPS`** |

---

## Executive verdict

Consolidation gates and V2.03 Batch 1–3 operational suites are green. Remaining failures are **PRE_EXISTING**, **TEST_DEBT**, or **ENVIRONMENTAL** — none classified as consolidation-caused P0/P1. No code fix applied in PC23.

```text
V2_03_POST_CONSOLIDATION_QA_READY_WITH_P2_GAPS
```

---

## Environment

```text
NODE_ENV=test
GETPRO_TEST_DB=1
TEST_DATABASE_URL / DATABASE_URL ← .env.testing.local DATABASE_URL
DB connectivity probe: OK
```

Logs: `/tmp/pc23/*.log` (+ `.exit`).

---

## Suite matrix (executed)

| Batch | Suites (representative) | Tests | Pass | Fail | Exit |
|-------|-------------------------|------:|-----:|-----:|-----:|
| **architecture** | `npm run test:architecture` | 7 | 7 | 0 | 0 |
| **platform-core** | PC15/03/18/19 + PC02/06–11 + v8 auth/session/RBAC/isolation + phone/media/website lifecycle | 208 | 208 | 0 | 0 |
| **platform-publish-reg** | PC10B BB/AC baselines, church publish, website engine/authz, media folders, unified reg, BB platform-01, AC platform-02 | 140 | 138 | 2 | 1 |
| **bb-critical** | public URL harden, HQ/branch website, P0 publish auth, phase4 publish, shared editor, content admin, draft/live integrity | 62 | 60 | 2 | 1 |
| **bb-reg-extra** | BB platform-01 (re-run), HQ/branch isolation sample | 6 | 6 | 0 | 0 |
| **ac-batch1** | Batch1a config, management, patients, appointments, clinical, billing | 28 | 28 | 0 | 0 |
| **ac-batch2** | shell, dashboard, facilities, patient/appt workspace, clinical encounter, queues, billing, RBAC | 27 | 27 | 0 | 0 |
| **ac-batch3** | rooms, clinical docs, ACN17/19/20, ACP03–07 | 29 | 29 | 0 | 0 |
| **ac-website** | clinic availability, CMS, public website, hardening, template, PC10B AC workflow | 39 | 38 | 1 | 1 |
| **ac-foundations** | pharmacy/diagnostics/patient/clinical/facility/appointment foundations + portal + booking + login + ACW09 | 85 | 80 | 5 | 1 |
| **migrations** | v8 migration contract, identity gate, mapping, DB compat baseline, platform identity foundation | 56 | 56 | 0 | 0 |

**Coverage vs ask**

| Area | Result |
|------|--------|
| Platform bootstrap / product resolution / auth / session / RBAC / isolation | **PASS** (platform-core) |
| Registration / phone / email / media / website engine / publishing / CMS | **PASS** with known AC reg edit GET debt |
| Architecture tests | **PASS** |
| BlessBoard registration / HQ-branch / editor / publish / public | **PASS** with draft/live path-public + CDN demo debt |
| ActiveClinic Batch 1–3 | **PASS** (all green) |
| Patients / appointments / clinical / pharmacy / diagnostics / rooms / docs | **PASS** (batch + foundation suites) |
| AC website / publish baselines | **PASS** except fixture `user_roles` freeze |
| Patient portal / unified login / ACW09 CSS cache-bust | Failures classified below — not Batch 1–3 blockers |
| Migrations identity / order / ceiling / no history rewrite | **PASS** |

---

## Failure classification

| ID | Suite / assertion | Severity | Class | Consolidation-caused? | Notes |
|----|-------------------|----------|-------|------------------------|-------|
| F1 | `activeclinic-platform-02` — GET `/register-clinic?step=clinic` after review expects **200**, got **302** (×2) | P2 | **PRE_EXISTING** / **TEST_DEBT** | **No** | Documented in PC18 residual: draft-cookie navigation; unrelated to org-key lift |
| F2 | `v7-website-draft-live-integrity` — apex `/c/dli-a` expects **200**, got **301** | P2 | **PRE_EXISTING** / **TEST_DEBT** | **No** | Intentional primary-branch redirect (PC10A F3 / PC10C); publish/restore subtest still **PASS** |
| F3 | Same suite — demo image `/church/images/tenant-public/about-story.jpg` → CDN validation | P2 | **ENVIRONMENTAL** / **TEST_DEBT** | **No** | Known from PC07; requires CDN presentation of demo paths in test env |
| F4 | `activeclinic-clinic-website-availability` — insert into `blessboard.user_roles` | P2 | **PRE_EXISTING** / **TEST_DEBT** | **No** | V2.02 freeze: use `user_role_assignments` / catalogue roles (same class as PC21 tooling note) |
| F5 | `activeclinic-acw09-registration` — CSS `?v=` pin `v7-minisite-align-1` vs live `v2-sp-vis-1`; `acceptTerms` selector | P2 | **TEST_DEBT** | **No** | Stale cache-bust / form-field asserts; registration page itself returns 200 |
| F6 | `activeclinic-patient-portal` — guest token registration **400** | P2 | **PRE_EXISTING** / **TEST_DEBT** | **No** | Outside Batch 1–3; not touched by PC17–PC22 mechanism lifts |
| F7 | `activeclinic-unified-login` — `getproapp.pronline.org` `PLATFORM_LINE_HOST_MISMATCH` | P2 | **ENVIRONMENTAL** / **TEST_DEBT** | **No** | Host/profile assertion vs local test deployment mapping |

**Consolidation-caused P0/P1:** **none** → no PC23 production-code fix.

---

## Architecture / migration snapshot

```text
npm run test:architecture → PASS
platformAllowlistSize: 30 (PC22)
crossAllowlistSize:    0
BB→AC / AC→BB / AC→church unexplained: 0
Migration contract + identity gate + mapping + compatibility baseline: PASS
```

---

## Residual gaps (QA may proceed with awareness)

1. **PC22 residual P2** — Class-E composition floor, large product editor route files, optional future mechanism extraction (not blockers).
2. **Suite debt above (F1–F7)** — align tests to path-public 301, CDN demo fixtures, role-assignment inserts, CSS `?v=` pins, AC registration GET edit contract, portal/host profile asserts — **outside** consolidation fix scope.
3. **Finder stitch dirs ×3** — design-reference only (PC20/21); zero `* 2.*` files.

---

## Explicit non-actions

- No architectural refactor
- No opportunistic redesign
- No production deploy / production DB
- No migration history rewrite
- No force-push

---

## Required marker

```text
V2_03_POST_CONSOLIDATION_QA_READY_WITH_P2_GAPS
```

Alternate markers **not** awarded:

- `V2_03_POST_CONSOLIDATION_QA_READY` — residual P2/test-debt gaps remain
- `V2_03_POST_CONSOLIDATION_QA_BLOCKED` — no consolidation P0/P1; Batch 1–3 + architecture + migrations green
