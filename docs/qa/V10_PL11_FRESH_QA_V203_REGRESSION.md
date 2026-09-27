# V10 PL11 — Fresh QA V2.03 Regression

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_FRESH_QA_V203` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PL10 `V10_QA_CANONICAL_RESET_PASS` |
| **QA DB** | Post-PL10 canonical reset (`moovex-platform-v7` / `testing`) |
| **Production** | **UNTOUCHED** |
| **Verdict** | **`V10_FRESH_QA_V203_PASS_WITH_P2_GAPS`** |

---

## Executive verdict

Fresh QA schema + V2.03 Batch 1–3 + platform/BB/AC critical paths are green. Remaining failures are **P2** (`PRE_EXISTING` / `TEST_DEBT` / `ENVIRONMENTAL`) — same class as PC23 F1–F7, plus one PC11 test-pin drift. **No P0/P1.**

```text
V10_FRESH_QA_V203_PASS_WITH_P2_GAPS
```

---

## Environment

```text
NODE_ENV=test
GETPRO_TEST_DB=1
DEPLOYMENT_ENV=testing
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=testing
PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing
DATABASE_URL ← .env.testing.local (hosted testing)
QA identity probe: moovex-platform-v7 / testing · schema_ok · ceiling 043/118/042 · orgs=2
```

Logs: `/tmp/pl11/*.log` (+ `.exit`).

---

## Suite matrix

| Batch | Coverage | Tests | Pass | Fail | Exit |
|-------|----------|------:|-----:|-----:|-----:|
| **architecture** | `npm run test:architecture` | 7 | 7 | 0 | 0 |
| **migrations** | contract, identity gate, mapping, compat, PL07 baseline, PC06 ownership | 62 | 62 | 0 | 0 |
| **platform-core** | PC02–PC19 characterization, auth/session/verification/RBAC/isolation, phone, media, website lifecycle/CMS | 275 | 273 | 2 | 1 |
| **platform-publish-reg** | PC10B BB/AC, church publish, engine authz, BB platform-01, AC platform-02/03, phone parity | 111 | 108 | 3 | 1 |
| **bb-critical** | public URL, HQ/branch, P0 publish auth, phase4 publish/restore, editor, draft/live | 68 | 66 | 2 | 1 |
| **bb-domain** | registration, members schema/journey/portal, CSRF | 20 | 20 | 0 | 0 |
| **ac-batch1** | config, management, patients, appointments, clinical, billing | 28 | 28 | 0 | 0 |
| **ac-batch2** | shell, dashboard, facilities, workspaces, queues, billing, RBAC | 27 | 27 | 0 | 0 |
| **ac-batch3** | rooms, clinical docs, ACN17/19/20, ACP03–07 visit summary | 29 | 29 | 0 | 0 |
| **ac-website** | availability, CMS, public, hardening, template, PC10B AC | 39 | 38 | 1 | 1 |
| **ac-foundations** | pharmacy/diagnostics/patient/clinical/facility/appointment + portal + booking + login + ACW09 | 85 | 80 | 5 | 1 |
| **ac-ops** | pharmacy/diagnostics foundations + billing foundation + pharmacy regression | 30 | 30 | 0 | 0 |
| **TOTAL** | | **781** | **768** | **13** | — |

### Coverage vs ask

| Area | Result |
|------|--------|
| Platform auth/session/registration/verification/phone/email/RBAC/isolation/media/website/publish/CMS/architecture | **PASS** (with P2 test pins below) |
| BB registration / HQ-branch / members / website / publish-version-restore / public | **PASS** (draft/live path-public + CDN demo debt) |
| AC registration / clinic/facility / Batch 1–3 / patients→visit summary / website | **PASS** (Batch 1–3 fully green) |
| AC patient/public flows | **PASS** with known portal/login host debt |
| Fresh QA schema ceiling + identity | **PASS** |
| Runtime expects removed legacy tables/columns | **NONE found** (scan below) |

---

## Legacy runtime expectation scan

Scanned `src/`, `views/`, `public/` for:

- `blessboard.user_roles` / `FROM user_roles`
- `public.tenants` / `public.session`
- `church.*` legacy schema
- `organization_key_legacy` / `v4_tenant`

**Result:** **0** runtime hits. (Frozen `user_roles` only appears in a **test fixture** that correctly fails closed — see F4.)

Content Library still uses shared `websiteEditorHttpUtils.wantsHtml` + `media-library.ejs` (PC11 lift) — runtime OK; test still pins local `function wantsHtml(` (F8).

---

## Failure classification

| ID | Suite / assertion | Severity | Class | Fresh-QA-caused P0/P1? | Notes |
|----|-------------------|----------|-------|------------------------|-------|
| F1 | `activeclinic-platform-02` — GET `/register-clinic?step=clinic` after review → **302** vs **200** (×2) | P2 | PRE_EXISTING / TEST_DEBT | **No** | PC23 F1 / PC18 residual |
| F2 | `activeclinic-platform-03` — review HTML missing `href="/register-clinic?step=clinic"` | P2 | PRE_EXISTING / TEST_DEBT | **No** | Same draft-cookie / edit navigation family as F1 |
| F3 | `v7-website-draft-live-integrity` — apex path expects **200**, got **301** | P2 | PRE_EXISTING / TEST_DEBT | **No** | PC23 F2 intentional primary-branch redirect |
| F4 | Same suite — demo image CDN validation | P2 | ENVIRONMENTAL / TEST_DEBT | **No** | PC23 F3 |
| F5 | `activeclinic-clinic-website-availability` — insert `blessboard.user_roles` | P2 | PRE_EXISTING / TEST_DEBT | **No** | PC23 F4; freeze correctly enforced |
| F6 | `activeclinic-acw09-registration` — CSS `?v=` pin `v7-minisite-align-1` vs live `v2-sp-vis-1` (×3) | P2 | TEST_DEBT | **No** | PC23 F5; page returns 200 |
| F7 | `activeclinic-patient-portal` — guest token registration **400** | P2 | PRE_EXISTING / TEST_DEBT | **No** | PC23 F6 |
| F8 | `activeclinic-unified-login` — `getproapp.pronline.org` `PLATFORM_LINE_HOST_MISMATCH` | P2 | ENVIRONMENTAL / TEST_DEBT | **No** | PC23 F7 |
| F9 | `v7-shared-content-media-library` — local `function wantsHtml(` pin (×2) | P2 | TEST_DEBT | **No** | PC11 moved helper to platform; runtime still negotiates via shared util |

**P0:** **0** · **P1:** **0** · **P2:** **9** (13 failing leaf assertions across suites)

---

## Required marker

```text
V10_FRESH_QA_V203_PASS_WITH_P2_GAPS

Architecture/migrations/Batch1–3: PASS
Platform/BB/AC critical paths: PASS with P2 test debt only
Legacy removed-table runtime expects: 0
P0: 0  P1: 0  P2: 9
Production: UNTOUCHED
```
