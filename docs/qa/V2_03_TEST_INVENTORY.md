# V2.03 QA — Test Inventory (QA02)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_TEST_INVENTORY` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Mode** | **READ ONLY** inventory (no test runs required for this doc) |
| **Baseline companion** | [`V2_03_QA_BASELINE.md`](./V2_03_QA_BASELINE.md) |
| **Verdict** | **`V203_TEST_INVENTORY_COMPLETE`** |

---

## Required totals

```text
V203_TEST_INVENTORY_COMPLETE

TOTAL_TEST_FILES: 854
TOTAL_TEST_CASES: 7554
DEFAULT_SUITE_FILES: 851
ORPHAN_TEST_FILES: 59
E2E_TESTS: 21
HOSTED_TESTS: 67
COVERAGE_TOOL: c8
```

| Metric | Count | Definition used |
|--------|------:|-----------------|
| **TOTAL_TEST_FILES** | **854** | `tests/**/*.test.js` (851) + `*.spec.js` (3) |
| **TOTAL_TEST_CASES** | **7554** | Heuristic count of `it(` / `test(` call sites (approximate; nested suites inflate) |
| **DEFAULT_SUITE_FILES** | **851** | Matched by `npm test` → `tests/**/*.test.js` |
| **ORPHAN_TEST_FILES** | **59** | Smoke/hosted verification scripts with **no** `package.json` script wiring (manual only) |
| **E2E_TESTS** | **21** | Playwright specs + node suites named/classified browser/E2E/mobile/visual |
| **HOSTED_TESTS** | **67** | Hosted/deployed smoke + `*hosted*` verification scripts/tests (strict path/script match) |
| **COVERAGE_TOOL** | **c8** | Via `test:v8:coverage` / `test:v8:regression:coverage` (`c8` in devDependencies) |

### Adjacent inventories (not in TOTAL_TEST_FILES)

| Set | Count | Notes |
|-----|------:|-------|
| Smoke / hosted script entries scanned | 70 | under `scripts/` + `db/scripts/` |
| Orphan (unwired) subset | 59 | listed below |
| Node tests with **no dedicated** npm script (wildcard-only via `npm test`) | 693 | still in default suite |

---

## How tests are executed

### Default command

```json
"test": "NODE_ENV=test node --test \"tests/**/*.test.js\""
```

- Runner: **Node.js built-in test runner** (`node --test`)
- Includes **all** 851 `*.test.js` files under `tests/`
- Does **not** include Playwright `*.spec.js`
- Does **not** set `GETPRO_TEST_DB=1` — DB-backed suites often skip/fail unless callers export test DB env (many curated scripts use `scripts/run-node-tests-with-test-db.js`)

### Curated npm script surface

~177 named `test:*` / `smoke:*` / hosted DB QA scripts exist in `package.json` (examples: `test:architecture`, `test:v8:*`, `test:blessboard:*`, `test:activeclinic:*`, `test:ui`, `test:e2e:foundation`, `db:runtime-smoke:testing`, `test:v8:hosted-smoke`).

**693** node test files are **only** reached through the `npm test` glob (no file-named script).

### Playwright

| Command | Config | Scope |
|---------|--------|-------|
| `npm run test:ui` | `playwright.config.cjs` | `testDir: ./tests` — intended visual specs (`ui.spec.js`, `brand-home-stability.spec.js`); **note:** default Playwright match may also consider `*.test.js` unless filtered at runtime |
| `npm run test:e2e:foundation` | `playwright.foundation.config.cjs` | `tests/e2e/foundation-security.spec.js` only; requires `E2E_DATABASE_URL` |

### Coverage

| Tool | Scripts |
|------|---------|
| **c8** | `npm run test:v8:coverage`, `npm run test:v8:regression:coverage` |
| Playwright | traces/screenshots on failure; not line-coverage |

No `nyc`/`istanbul`/`jest` coverage config present. No global `npm run coverage` for the full `npm test` suite.

### CI (GitHub Actions)

File: `.github/workflows/ci.yml`

| Item | Value |
|------|--------|
| Triggers | push/PR to **`main`**, **`v2`**, **`V7` only** |
| **V10** | **Not** in trigger list — V10 tip is **not** CI-gated by this workflow |
| Job `secret-hygiene` | `node --test tests/committed-secret-hygiene.test.js` |
| Job `component-check` | EJS/CSS/component baselines + Vite build + **`npm run test:ui`** (Playwright Chromium) — only when base/ref is main or v2 |

**CI does not run `npm test`**, BlessBoard/AC regression packs, or hosted smokes.

---

## Product distribution (node `*.test.js`)

| Product | Files |
|---------|------:|
| PLATFORM | 78 |
| BB | 464 |
| AC | 146 |
| SHARED | 163 |
| **Total** | **851** |

Classification is **heuristic** (filename + light content scan). Cross-product suites (e.g. `v7-bb-ac-*`, `v10-pc*`) → SHARED or PLATFORM.

---

## Layer / category coverage (multi-label; files may appear in >1)

| Category | Approx files tagged |
|----------|--------------------:|
| unit | 161 |
| integration | 96 |
| route/HTTP | 511 |
| repository | 170 |
| DB | 76 |
| migration | 9 |
| security | 29 |
| RBAC | 27 |
| tenant-isolation | 13 |
| host/routing | 92 |
| browser/E2E | 46 |
| smoke scripts | 70 |
| hosted-verification (loose prior pass) | see strict HOSTED below |

Primary-layer mode for node tests (first assigned layer):

| Primary layer | Files |
|---------------|------:|
| route/HTTP | 308 |
| repository | 164 |
| unit | 160 |
| integration | 79 |
| DB | 41 |
| host/routing | 28 |
| security | 24 |
| RBAC | 17 |
| browser/E2E | 12 |
| migration | 9 |
| tenant-isolation | 9 |

---

## Requirement flags (node + playwright)

| Flag | Approx count | Meaning |
|------|-------------:|---------|
| DB required | 446 | Uses/expects Postgres / `GETPRO_TEST_DB` / migrator / ephemeral DB helpers |
| Network / live URL | (subset) | Hosted smoke & some env probes |
| Hosted required (strict) | 67 | See hosted table |
| Destructive | 195 | Mentions purge/reset/DROP/TRUNCATE (includes safety tests that **guard** destruction) |
| Current | nearly all | No mass obsolete markers found |
| Executed by `npm test` | 851 | All `*.test.js` |
| Executed by CI | ~4 paths | secret hygiene + Playwright visual (`test:ui`) on main/v2 |
| Manual only | 59 | Orphan scripts |

---

## E2E / browser tests (21)

| File | Product | Kind | Cases | How run |
|------|---------|------|------:|---------|
| `db/scripts/blessboard-rbac-e2e.js` | BB | script | 0 | blessboard:rbac-e2e |
| `tests/activeclinic-auth-stitch-parity.test.js` | AC | node:test | 9 | npm test |
| `tests/activeclinic-mw-stitch-parity.test.js` | AC | node:test | 5 | npm test |
| `tests/activeclinic-pass7-mobile.test.js` | AC | node:test | 2 | npm test |
| `tests/activeclinic-phase10-browser.test.js` | AC | node:test | 8 | npm test |
| `tests/activeclinic-phase8-mobile.test.js` | AC | node:test | 7 | npm test |
| `tests/blessboard-login-mobile-overflow.test.js` | BB | node:test | 4 | npm test |
| `tests/blessboard-phase7-visual-stitch.test.js` | BB | node:test | 7 | npm test |
| `tests/blessboard-qa-browser-login.test.js` | BB | node:test | 5 | npm test |
| `tests/blessboard-rbac-e2e.test.js` | BB | node:test | 8 | test:blessboard:rbac-e2e |
| `tests/blessboard-v5-mobile-burger-browser.test.js` | BB | node:test | 1 | npm test |
| `tests/brand-home-stability.spec.js` | SHARED | playwright | 1 | test:ui / test:e2e:foundation |
| `tests/church-growth-e2e-flows.test.js` | BB | node:test | 3 | test:e2e:growth |
| `tests/e2e/foundation-security.spec.js` | BB | playwright | 8 | test:ui / test:e2e:foundation |
| `tests/ui.spec.js` | SHARED | playwright | 7 | test:ui / test:e2e:foundation |
| `tests/v7-auth-reg-stitch-parity.test.js` | SHARED | node:test | 24 | npm test |
| `tests/v7-bb-mobile-editor-pointer.test.js` | SHARED | node:test | 6 | npm test |
| `tests/v7-local-registration-to-website-e2e.test.js` | SHARED | node:test | 1 | npm test |
| `tests/v7-website-catalogue-390px.test.js` | SHARED | node:test | 1 | npm test |
| `tests/v7-website-mobile-editor.test.js` | SHARED | node:test | 6 | npm test |
| `tests/v8-shared-forms-e2e.test.js` | PLATFORM | node:test | 9 | npm test |

---

## Hosted verification (67)

Strict match: path/script name contains hosted/deployed/runtime-smoke/registration-qa/hosted-auth, or wired npm script.

| File | Product | Kind | package.json | In npm test? |
|------|---------|------|--------------|--------------|
| `db/scripts/activeclinic-hosted-auth-qa.js` | AC | script | activeclinic:hosted-auth-qa:testing | no |
| `db/scripts/blessboard-hosted-test-users-seed.js` | BB | script | blessboard:hosted-test-users:seed | no |
| `db/scripts/v7-testing-registration-qa.js` | SHARED | script | db:registration-qa:testing | no |
| `db/scripts/v7-testing-runtime-smoke.js` | SHARED | script | db:runtime-smoke:testing | no |
| `scripts/activeclinic/audit-hosted-website-schema.js` | AC | script | **manual only** | no |
| `scripts/check-hosted-testing-sha.js` | AC | script | **manual only** | no |
| `scripts/local/ac-platform-02-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/ac-registration-identity-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/bb-platform-01-hosted-qa.js` | PLATFORM | script | **manual only** | no |
| `scripts/local/bb-registration-identity-hosted-qa.js` | BB | script | **manual only** | no |
| `scripts/local/editor-release-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/qa-bug08-disposable-hosted-branding.js` | BB | script | **manual only** | no |
| `scripts/local/qa-hosted-login-check.js` | AC | script | **manual only** | no |
| `scripts/local/v11-qa-freeze-hosted-gate.js` | AC | script | **manual only** | no |
| `scripts/local/v2-01-publish-lookup-repro-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v2-ac-doctor-image-hosted.js` | AC | script | **manual only** | no |
| `scripts/local/v2-ac-doctors-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/v2-ac-service-card-edit-hosted.js` | AC | script | **manual only** | no |
| `scripts/local/v2-ac-services-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/v2-bb-about-default-images-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-about-image-isolation-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-all-images-editability-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-contact-hours-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-contact-image-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-home-leaders-image-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-home-leaders-text-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-leadership-data-loss-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-leadership-section-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-ministry-image-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-ministry-leader-image-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-bb-season-image-hosted.js` | BB | script | **manual only** | no |
| `scripts/local/v2-shared-media-type-conversion-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v2-shared-media-upload-parity-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-ac-final-certification-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-ac-qa-wave1-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-ac-qa-wave2-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-ac-staff-invite-phone-hosted-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-bb-ac-auth-reg-cleanup-hosted-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-bb-ac-register-phone-fields-hosted-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-branch-editor-canonical-hosted-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-bugs-01-09-hosted-browser-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-bugs-10-15-hosted-browser-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-bugs-10-15-hosted-closure-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-cdn-image-final-gate-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-phone-login-hosted-qa.js` | SHARED | script | **manual only** | no |
| `scripts/local/v7-production-readonly-smoke.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-bb-flows-07-09-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-bb-membership-wizard-p40-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-hosted-84-screen-visual-capture.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-hosted-auth-qa-prompt29-rerun.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-hosted-auth-qa-prompt29.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-hosted-visual-audit-discover.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-public-forms-p35-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-qa-readiness-p42-hosted.js` | SHARED | script | **manual only** | no |
| `scripts/local/v8-shared-forms-p39-hosted.js` | PLATFORM | script | **manual only** | no |
| `scripts/local/wave2-editor-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/wave3-editor-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/wave4a-editor-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/wave4b1-editor-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/local/wave4b2-editor-hosted-qa.js` | AC | script | **manual only** | no |
| `scripts/smoke-v5-deployed.js` | SHARED | script | smoke:v5:deployed | no |
| `scripts/v8/diagnose-hosted-503.js` | AC | script | test:v8:diagnose-503 | no |
| `scripts/v8/hosted-smoke.js` | AC | script | test:v8:hosted-smoke | no |
| `tests/activeclinic-hosted-auth-qa-safety.test.js` | AC | node:test | **manual only** | yes |
| `tests/blessboard-deployed-smoke.test.js` | BB | node:test | test:blessboard:deployed-smoke | yes |
| `tests/blessboard-hosted-test-users-seed.test.js` | BB | node:test | test:blessboard:hosted-test-users-seed | yes |
| `tests/v7-hosted-testing-sha.test.js` | SHARED | node:test | test:v7:deploy-sha | yes |

---

## Orphan files — exist but not in normal test commands (59)

Definition: verification/smoke scripts under `scripts/` or `db/scripts/` with **zero** `package.json` script references. Not executed by `npm test`, curated `test:*`, or CI.

| File | Product | Layers | Status |
|------|---------|--------|--------|
| `db/scripts/v10-dbcl01-cleanliness-audit.js` | PLATFORM | smoke/script+DB | manual only |
| `scripts/activeclinic/audit-hosted-website-schema.js` | AC | smoke/script+host/routing | manual only |
| `scripts/activeclinic/platform-admin-website-smoke.js` | AC | smoke/script+route/HTTP | manual only |
| `scripts/check-hosted-testing-sha.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/ac-platform-02-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/ac-registration-identity-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/bb-platform-01-hosted-qa.js` | PLATFORM | smoke/script+browser/E2E | manual only |
| `scripts/local/bb-registration-identity-hosted-qa.js` | BB | smoke/script+browser/E2E | manual only |
| `scripts/local/editor-release-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/qa-bug08-disposable-hosted-branding.js` | BB | smoke/script+browser/E2E | manual only |
| `scripts/local/qa-hosted-login-check.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/rehearsal-cutover-smoke.js` | AC | smoke/script+route/HTTP | manual only |
| `scripts/local/v11-qa-freeze-hosted-gate.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/v2-01-publish-lookup-repro-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v2-ac-doctor-image-hosted.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/v2-ac-doctors-hosted-qa.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/v2-ac-service-card-edit-hosted.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/v2-ac-services-hosted-qa.js` | AC | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-about-default-images-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-about-image-isolation-hosted.js` | BB | smoke/script+tenant-isolation | manual only |
| `scripts/local/v2-bb-all-images-editability-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-contact-hours-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-contact-image-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-home-leaders-image-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-home-leaders-text-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-leadership-data-loss-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-leadership-section-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-ministry-image-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-ministry-leader-image-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-bb-season-image-hosted.js` | BB | smoke/script+host/routing | manual only |
| `scripts/local/v2-shared-media-type-conversion-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v2-shared-media-upload-parity-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v7-ac-final-certification-hosted.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-ac-qa-wave1-hosted.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-ac-qa-wave2-hosted.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-ac-staff-invite-phone-hosted-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-bb-ac-auth-reg-cleanup-hosted-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-bb-ac-register-phone-fields-hosted-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-branch-editor-canonical-hosted-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-bugs-01-09-hosted-browser-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-bugs-10-15-hosted-browser-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-bugs-10-15-hosted-closure-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-cdn-image-final-gate-hosted.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-phone-login-hosted-qa.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v7-production-readonly-smoke.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v8-bb-flows-07-09-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-bb-membership-wizard-p40-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-hosted-84-screen-visual-capture.js` | SHARED | smoke/script+browser/E2E | manual only |
| `scripts/local/v8-hosted-auth-qa-prompt29-rerun.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-hosted-auth-qa-prompt29.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-hosted-visual-audit-discover.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-public-forms-p35-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-qa-readiness-p42-hosted.js` | SHARED | smoke/script+host/routing | manual only |
| `scripts/local/v8-shared-forms-p39-hosted.js` | PLATFORM | smoke/script+host/routing | manual only |
| `scripts/local/wave2-editor-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/wave3-editor-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/wave4a-editor-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/wave4b1-editor-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |
| `scripts/local/wave4b2-editor-hosted-qa.js` | AC | smoke/script+browser/E2E | manual only |

### Also outside `npm test` (but **not** counted as orphan — have dedicated commands)

| File | Command |
|------|---------|
| `tests/ui.spec.js` | `npm run test:ui` |
| `tests/brand-home-stability.spec.js` | `npm run test:ui` |
| `tests/e2e/foundation-security.spec.js` | `npm run test:e2e:foundation` |
| Wired hosted smokes (e.g. `scripts/v8/hosted-smoke.js`) | `test:v8:hosted-smoke`, `smoke:v5:deployed`, `db:runtime-smoke:testing`, … |

---

## Notable gaps / risks for V2.03 QA

1. **`npm test` ≠ CI**: full suite is local/manual; CI covers secret hygiene + Playwright visual on main/v2 only.
2. **V10 not CI-triggered**: baseline branch relies on curated local suites (architecture, PL11 packs, product scripts).
3. **DB env mismatch**: bare `npm test` omits `GETPRO_TEST_DB` / test-db harness used by many suites.
4. **Large wildcard surface**: 693 files have no dedicated script — easy to miss in “run the AC/BB smoke” habit if operators only run named scripts.
5. **Hosted QA mostly manual**: 59 unwired `scripts/local/*hosted*` gates from prior waves; not part of default automation.
6. **Coverage not global**: c8 only via V8 regression helpers — no repo-wide coverage gate.
7. **Playwright `testDir: ./tests`**: confirm `test:ui` only executes intended `*.spec.js` in practice (inventory flag for QA03).

---

## Named test-related scripts (index)

```text
activeclinic:hosted-auth-qa:testing
db:canonical-fresh-bootstrap
db:qa:canonical-reset
db:registration-qa:testing
db:runtime-smoke:testing
smoke:v5:deployed
test:activeclinic:admin-role-migration
test:activeclinic:demo-clinics-seed
test:activeclinic:demo-role-users
test:activeclinic:diagnostics-rbac
test:activeclinic:finance-rbac
test:activeclinic:multi-role-rbac
test:activeclinic:navigation-rbac
test:activeclinic:patient-merge-safety
test:activeclinic:qa-role-users
test:activeclinic:rbac-role-matrix
test:activeclinic:roles-access-admin
test:activeclinic:staff-invitation
test:activeclinic:testing-tenant-purge
test:activeclinic:v7-regression
test:architecture
test:blessboard:a11y-structure
test:blessboard:add-one-calendar-month
test:blessboard:additional-branch-provisioning
test:blessboard:admin-modules
test:blessboard:admin-ops-alerts
test:blessboard:admin-registration-applications
test:blessboard:admin-registration-ops
test:blessboard:announcements
test:blessboard:apex
test:blessboard:apex-auth-gui
test:blessboard:apex-directory
test:blessboard:apex-home
test:blessboard:apex-marketing
test:blessboard:attendance
test:blessboard:auth
test:blessboard:auth-schema
test:blessboard:authorization
test:blessboard:authorization-migration
test:blessboard:authorization-shells
test:blessboard:billing-boundaries
test:blessboard:branch-admin-shell
test:blessboard:branch-display-name
test:blessboard:branch-list
test:blessboard:catalogue
test:blessboard:church-website-publish
test:blessboard:content-admin
test:blessboard:csrf-action-audit
test:blessboard:demo-church-config
test:blessboard:demo-v5-dataset
test:blessboard:deployed-smoke
test:blessboard:design-system
test:blessboard:finance-separation
test:blessboard:forms-requests
test:blessboard:foundation-schema-status
test:blessboard:frontend-assets
test:blessboard:giving
test:blessboard:growth-trial-expiry
test:blessboard:growth-trial-offer
test:blessboard:growth-trial-registration
test:blessboard:hosted-test-users-seed
test:blessboard:hq-branch-user-creation
test:blessboard:hq-shell
test:blessboard:http-context
test:blessboard:input-output-safety
test:blessboard:instant-free-registration
test:blessboard:kill-switches
test:blessboard:media
test:blessboard:member-journey-foundation
test:blessboard:member-journey-workflow
test:blessboard:member-portal
test:blessboard:member-registration
test:blessboard:member-suite
test:blessboard:members-schema
test:blessboard:network-support-registration
test:blessboard:otp-foundation
test:blessboard:participation
test:blessboard:pastoral-welfare
test:blessboard:phone-first-forms
test:blessboard:phone-identity-foundation
test:blessboard:phone-invitation-sharing
test:blessboard:phone-login
test:blessboard:phone-otp-workflows
test:blessboard:platform-account-recovery
test:blessboard:platform-admin-directory
test:blessboard:platform-admin-integration
test:blessboard:platform-admin-shell
test:blessboard:platform-admin-team
test:blessboard:platform-deployments-system
test:blessboard:platform-domains-links
test:blessboard:platform-roles-access
test:blessboard:platform-settings
test:blessboard:platform-support-mode
test:blessboard:precommit-fast
test:blessboard:provision-cli-safety
test:blessboard:provisioning
test:blessboard:public-content-schema
test:blessboard:public-pages
test:blessboard:qa-role-users
test:blessboard:rbac-e2e
test:blessboard:rbac-foundation
test:blessboard:register-church
test:blessboard:registration-approval-invitation
test:blessboard:registration-onboarding-analytics
test:blessboard:registration-operator-approval
test:blessboard:registration-phone
test:blessboard:registration-risk-review
test:blessboard:registration-trace
test:blessboard:regression-local
test:blessboard:reports-audit
test:blessboard:responsive-structure
test:blessboard:route-link-audit
test:blessboard:security-audits
test:blessboard:server-query-audit
test:blessboard:settings
test:blessboard:shadow-log-validator
test:blessboard:shells
test:blessboard:staff-access
test:blessboard:staff-invitation
test:blessboard:structure
test:blessboard:support-follow-up-ops
test:blessboard:tenant-auth
test:blessboard:tenant-host-login
test:blessboard:tenant-routing
test:blessboard:test-users-seed
test:blessboard:testing-demo-content-seed
test:blessboard:testing-maintenance
test:blessboard:testing-org-purge
test:blessboard:v5-fixtures
test:blessboard:v5:regression
test:blessboard:v5:regression:fast
test:blessboard:write-maintenance
test:church:db
test:church:focused
test:church:pilot-smoke
test:church:regression
test:db:bootstrap-foundation
test:db:canonical-migration-baseline
test:db:foundation
test:db:schema
test:e2e:foundation
test:e2e:growth
test:migration:mapping
test:migration:tooling
test:migration:v5-to-v7
test:pg
test:pg:isolated
test:pg:repos
test:platform:diagnostic-integration
test:platform:entitlements
test:platform:host-comparison
test:platform:http-context
test:platform:provisioning
test:platform:resolution
test:platform:sessions
test:ui
test:ui:update
test:v5:environment
test:v5:foundation-startup
test:v5:logging-sensitive
test:v7:deploy-sha
test:v7:runtime-schema
test:v8:auth-security
test:v8:coverage
test:v8:db-compat
test:v8:diagnose-503
test:v8:env-isolation
test:v8:hosted-smoke
test:v8:migration-contract
test:v8:rbac-isolation
test:v8:regression
test:v8:regression:coverage
test:v8:session-security
test:v8:suite
test:v8:tenant-isolation
test:v8:verification
test:v8:website-sections
```

---

## Appendix A — Per-file inventory (node + Playwright)

Flags column: `DB/NET/HOST/DEST/npm/CI/scr|wild/cur`  
(`scr` = named script references file; `wild` = only via `npm test` glob)

| File (under tests/) | Product | Layers | Cases | Flags | Primary runner |
|---------------------|---------|--------|------:|-------|----------------|
| `about-v11-platform.test.js` | BB | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-account-lifecycle.test.js` | AC | route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-acw-public-site.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-acw08-auth.test.js` | AC | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-acw09-registration.test.js` | AC | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-acw10-12.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-admin-role-migration.test.js` | AC | migration+repository | 5 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:admin-role-migration |
| `activeclinic-app-exact-auth.test.js` | AC | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-application-shell.test.js` | AC | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-appointment-foundation.test.js` | AC | DB+route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-appointment-ui-parity.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-auth-stitch-parity.test.js` | AC | route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-authentication-foundation.test.js` | AC | DB+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-appointments.test.js` | AC | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-billing.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-clinical.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-config.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-management-data.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch1a-patient-reception.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-appointments-workspace.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-billing.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-clinical-encounter.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-dashboard.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-facilities.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-operational-queues.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-patient-workspace.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-rbac-isolation.test.js` | AC | RBAC+tenant-isolation+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch2-shell.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acn17-acn19.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acn18-clinical-documents.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acn20.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acn27-rooms.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acp03-acp07.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acp04.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acp05-visit-summary.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-batch3-acp06.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-billing-ui-parity.test.js` | AC | integration | 21 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `activeclinic-booking-patient-linkage.test.js` | AC | integration | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-directory.test.js` | AC | route/HTTP | 16 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-first-login-setup.test.js` | AC | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-onboarding.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-pa-route-hygiene.test.js` | AC | route/HTTP | 1 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-registration-applicant-status.test.js` | AC | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-registration-deployment-code.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-registration-review-lifecycle.test.js` | AC | route/HTTP | 14 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-registration.test.js` | AC | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinic-website-availability.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinical-foundation.test.js` | AC | DB | 15 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-clinical-ui-parity.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-dashboard-capabilities.test.js` | AC | unit | 16 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-dashboard-shell-parity.test.js` | AC | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-demo-clinics-seed.test.js` | AC | repository+route/HTTP | 5 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:demo-clinics-seed |
| `activeclinic-demo-role-users.test.js` | AC | repository | 1 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:demo-role-users |
| `activeclinic-departments-pharmacy-regression.test.js` | AC | route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-deployment-foundation.test.js` | AC | DB+route/HTTP | 16 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-diagnostics-foundation.test.js` | AC | DB | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-diagnostics-rbac.test.js` | AC | RBAC+route/HTTP | 10 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:diagnostics-rbac |
| `activeclinic-diagnostics-ui-parity.test.js` | AC | integration | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-editor-client-contracts.test.js` | AC | browser/E2E | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-facilities-parity.test.js` | AC | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-facility-foundation.test.js` | AC | DB+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-facility-public-hours.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-finance-rbac.test.js` | AC | RBAC+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:finance-rbac |
| `activeclinic-foundation-states-parity.test.js` | AC | route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-hosted-auth-qa-safety.test.js` | AC | repository+host/routing | 12 | -/NET/HOST/DEST/npm/-/wild/cur | npm test |
| `activeclinic-location-precedence-ux.test.js` | AC | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-logout-after-switch.test.js` | AC | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf-identity.test.js` | AC | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf03-registration.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf05-onboarding.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf07-staff-invite.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf08-patient-registration.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf09-patient-dashboard.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-mf10-booking.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-multi-role-rbac.test.js` | AC | repository+RBAC | 13 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:multi-role-rbac |
| `activeclinic-mw-stitch-parity.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-navigation-rbac.test.js` | AC | RBAC+route/HTTP | 7 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:navigation-rbac |
| `activeclinic-organization-settings-parity.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pass5-missing-states.test.js` | AC | route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pass6-media.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pass7-mobile.test.js` | AC | browser/E2E | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pass8-design-system.test.js` | AC | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-password-recovery-testing-delivery.test.js` | AC | security | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-patient-foundation.test.js` | AC | DB | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-patient-merge-safety.test.js` | AC | integration | 9 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:patient-merge-safety |
| `activeclinic-patient-portal.test.js` | AC | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-patient-registration-rbac.test.js` | AC | RBAC+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-patient-ui-parity.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pharmacy-foundation.test.js` | AC | DB | 17 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-pharmacy-ui-parity.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase10-browser.test.js` | AC | browser/E2E+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase12-states.test.js` | AC | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase13-domain.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase14-rbac.test.js` | AC | RBAC+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase4-billing-ops.test.js` | AC | integration | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase4-patient-print-card.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase4-pharmacy-ops.test.js` | AC | integration | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase5a-procedure-booking.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase5b-appointments-reception.test.js` | AC | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase5c-pharmacy-partials.test.js` | AC | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase5d-billing-cashier-partials.test.js` | AC | unit | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase5e-partial-closure.test.js` | AC | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase8-mobile.test.js` | AC | browser/E2E | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phase9-a11y.test.js` | AC | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-phone-standardization.test.js` | AC | unit | 18 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-platform-02.test.js` | AC | repository+route/HTTP | 11 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `activeclinic-platform-03.test.js` | AC | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-product-isolation.test.js` | AC | tenant-isolation+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-project-10611909237747031838-parity.test.js` | AC | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-public-booking.test.js` | AC | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-public-root-routing.test.js` | AC | host/routing+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-public-website.test.js` | AC | route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-qa-role-users.test.js` | AC | repository | 5 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:qa-role-users |
| `activeclinic-qa-wave1-defects.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-rbac-role-matrix.test.js` | AC | RBAC | 12 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:rbac-role-matrix |
| `activeclinic-reception-foundation.test.js` | AC | repository+DB+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-reception-ui-parity.test.js` | AC | repository+route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-registration-identity-idempotency.test.js` | AC | integration | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-registration-terms.test.js` | AC | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-roles-access-admin.test.js` | AC | RBAC+route/HTTP | 5 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:roles-access-admin |
| `activeclinic-roles-access-parity.test.js` | AC | RBAC+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-session-principal.test.js` | AC | integration | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-staff-directory-parity.test.js` | AC | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-staff-invitation.test.js` | AC | repository+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:activeclinic:staff-invitation |
| `activeclinic-staff-invite-phone.test.js` | AC | route/HTTP | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-staff-management-parity.test.js` | AC | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-staff-rbac-foundation.test.js` | AC | RBAC+DB+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-testing-tenant-purge.test.js` | AC | integration | 13 | DB/-/-/DEST/npm/-/scr/cur | test:activeclinic:testing-tenant-purge |
| `activeclinic-transactional-email.test.js` | AC | unit | 13 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `activeclinic-unified-login.test.js` | AC | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-website-cms.test.js` | AC | repository+DB+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-website-hardening.test.js` | AC | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-website-json-error-matrix.test.js` | AC | route/HTTP | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `activeclinic-website-json-resolve-contract.test.js` | AC | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `add-one-calendar-month.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/scr/cur | test:blessboard:add-one-calendar-month |
| `admin-button-partial.test.js` | SHARED | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `admin-db-fixtures-env.test.js` | SHARED | unit | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `admin-demo-leads-crm-reset.test.js` | SHARED | route/HTTP | 2 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-bulk-actions.test.js` | SHARED | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-detail.test.js` | SHARED | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-drilldown.test.js` | SHARED | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-export.test.js` | SHARED | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-guardrails.test.js` | SHARED | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-health.test.js` | SHARED | route/HTTP | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-inline-actions.test.js` | SHARED | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-observability.test.js` | SHARED | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-pagination.test.js` | SHARED | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-presets.test.js` | SHARED | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-analytics-reporting-center.test.js` | SHARED | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-audit.test.js` | SHARED | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-disputes.test.js` | SHARED | route/HTTP | 7 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-pay-run-accounting-export.test.js` | SHARED | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-pay-run-reconciliation.test.js` | SHARED | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-pay-runs.test.js` | SHARED | integration | 19 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-field-agent-payment-reversal.test.js` | SHARED | route/HTTP | 10 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `admin-finance-cfo-dashboard.test.js` | SHARED | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `bb-ac-p0-overflow.test.js` | AC | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `bb-contact-stitch.test.js` | BB | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-about-draft-hydration.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-additional-branch-provisioning.test.js` | BB | route/HTTP | 16 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:additional-branch-provisioning |
| `blessboard-admin-mobile-nav-groups.test.js` | BB | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-admin-onboarding-support.test.js` | BB | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-admin-ops-alerts.test.js` | BB | repository+route/HTTP | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:admin-ops-alerts |
| `blessboard-admin-registration-applications.test.js` | BB | repository+route/HTTP | 13 | DB/-/-/-/npm/-/scr/cur | test:blessboard:admin-registration-applications |
| `blessboard-admin-registration-ops.test.js` | BB | repository+route/HTTP | 22 | DB/-/-/-/npm/-/scr/cur | test:blessboard:admin-registration-ops |
| `blessboard-announcement-platform-admin-testing-policy.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-announcements.test.js` | BB | repository+route/HTTP | 18 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:announcements |
| `blessboard-apex-auth-gui.test.js` | BB | host/routing | 5 | -/-/-/-/npm/-/scr/cur | test:blessboard:apex-auth-gui |
| `blessboard-apex-directory.test.js` | BB | repository+host/routing+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:apex-directory |
| `blessboard-apex-home.test.js` | BB | host/routing+route/HTTP | 3 | DB/-/-/-/npm/-/scr/cur | test:blessboard:apex-home |
| `blessboard-apex-hq-website-lifecycle.test.js` | BB | repository+host/routing+route/HTTP | 12 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-apex-legal.test.js` | BB | host/routing+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-apex-marketing.test.js` | BB | host/routing+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:apex-marketing |
| `blessboard-attendance.test.js` | BB | route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:attendance |
| `blessboard-auth-http.test.js` | BB | DB+route/HTTP | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:auth |
| `blessboard-auth-schema.test.js` | BB | DB | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:auth-schema |
| `blessboard-authoritative-host-allowlist.test.js` | BB | host/routing+route/HTTP | 16 | DB/-/-/-/npm/-/scr/cur | test:blessboard:tenant-routing |
| `blessboard-authorization-migration.test.js` | BB | migration+repository+RBAC | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:authorization-migration |
| `blessboard-authorization-shells.test.js` | BB | repository+RBAC+route/HTTP | 6 | DB/-/-/-/npm/-/scr/cur | test:blessboard:authorization-shells |
| `blessboard-authorization.test.js` | BB | RBAC+DB+route/HTTP | 28 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:authorization |
| `blessboard-billing-boundaries.test.js` | BB | route/HTTP | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:billing-boundaries |
| `blessboard-branch-admin-route-reconciliation.test.js` | BB | repository+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-admin-shell.test.js` | BB | DB+route/HTTP | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:branch-admin-shell |
| `blessboard-branch-display-name.test.js` | BB | repository | 12 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:branch-display-name |
| `blessboard-branch-list.test.js` | BB | integration | 2 | DB/-/-/-/npm/-/scr/cur | test:blessboard:branch-list |
| `blessboard-branch-mini-website-pages.test.js` | BB | route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-mini-website-shell.test.js` | BB | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-mini-websites.test.js` | BB | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-service-times.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-website-initialization.test.js` | BB | integration | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-website-publish-review.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-website-publish-stage6.test.js` | BB | repository | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-website-settings-chrome-scope.test.js` | BB | route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-branch-website-visual-editor-entry.test.js` | BB | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-catalogue-http-context.test.js` | BB | DB+route/HTTP | 23 | DB/-/-/-/npm/-/scr/cur | test:blessboard:http-context |
| `blessboard-catalogue-lookup.test.js` | BB | integration | 8 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:catalogue |
| `blessboard-catalogue-schema.test.js` | BB | DB | 7 | DB/-/-/-/npm/-/scr/cur | test:blessboard:catalogue |
| `blessboard-church-name-uniqueness.test.js` | BB | integration | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-church-provisioning.test.js` | BB | DB | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:provisioning |
| `blessboard-church-website-publish.test.js` | BB | repository+route/HTTP | 5 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:church-website-publish |
| `blessboard-content-admin.test.js` | BB | route/HTTP | 14 | DB/-/-/-/npm/-/scr/cur | test:blessboard:content-admin |
| `blessboard-custom-domain-routing.test.js` | BB | host/routing+DB+route/HTTP | 19 | DB/-/-/-/npm/-/scr/cur | test:blessboard:tenant-routing |
| `blessboard-demo-church-config.test.js` | BB | repository+route/HTTP | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:demo-church-config |
| `blessboard-demo-v5-dataset.test.js` | BB | repository+DB | 15 | DB/-/-/-/npm/-/scr/cur | test:blessboard:demo-v5-dataset |
| `blessboard-deployed-smoke.test.js` | BB | integration | 14 | -/NET/HOST/-/npm/-/scr/cur | test:blessboard:deployed-smoke |
| `blessboard-design-system.test.js` | BB | unit | 8 | -/-/-/-/npm/-/scr/cur | test:blessboard:design-system |
| `blessboard-finance-separation.test.js` | BB | repository+DB | 13 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:finance-separation |
| `blessboard-forms-requests.test.js` | BB | route/HTTP | 13 | DB/-/-/-/npm/-/scr/cur | test:blessboard:forms-requests |
| `blessboard-foundation-checklist-public-links.test.js` | BB | repository+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-foundation-schema-status.test.js` | BB | DB | 11 | DB/-/-/-/npm/-/scr/cur | test:blessboard:foundation-schema-status |
| `blessboard-giving.test.js` | BB | route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:giving |
| `blessboard-growth-trial-expiry.test.js` | BB | repository | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:growth-trial-expiry |
| `blessboard-growth-trial-offer.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/scr/cur | test:blessboard:growth-trial-offer |
| `blessboard-growth-trial-registration.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:growth-trial-registration |
| `blessboard-home-service-times.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-hosted-test-users-seed.test.js` | BB | repository+host/routing | 18 | DB/NET/HOST/-/npm/-/scr/cur | test:blessboard:hosted-test-users-seed |
| `blessboard-hq-branch-user-creation.test.js` | BB | integration | 7 | DB/-/-/-/npm/-/scr/cur | test:blessboard:hq-branch-user-creation |
| `blessboard-hq-executive-dashboard.test.js` | BB | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-hq-governance-audit.test.js` | BB | route/HTTP | 3 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-hq-roles.test.js` | BB | DB+route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-hq-shell.test.js` | BB | DB+route/HTTP | 15 | DB/-/-/-/npm/-/scr/cur | test:blessboard:hq-shell |
| `blessboard-inline-edit-save-contract.test.js` | BB | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-instant-free-registration.test.js` | BB | repository+route/HTTP | 21 | DB/-/-/-/npm/-/scr/cur | test:blessboard:instant-free-registration |
| `blessboard-invitation-password-reset.test.js` | BB | repository+security+route/HTTP | 7 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-invite-accept-button-label.test.js` | BB | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-kill-switches.test.js` | BB | security | 5 | -/-/-/-/npm/-/scr/cur | test:blessboard:kill-switches |
| `blessboard-login-mobile-overflow.test.js` | BB | browser/E2E | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-media.test.js` | BB | route/HTTP | 25 | DB/NET/-/-/npm/-/scr/cur | test:blessboard:media |
| `blessboard-member-journey-foundation.test.js` | BB | repository+DB | 18 | DB/-/-/-/npm/-/scr/cur | test:blessboard:member-journey-foundation |
| `blessboard-member-journey-workflow.test.js` | BB | DB+route/HTTP+integration | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:member-journey-workflow |
| `blessboard-member-portal.test.js` | BB | route/HTTP | 16 | DB/-/-/-/npm/-/scr/cur | test:blessboard:member-portal |
| `blessboard-member-registration.test.js` | BB | route/HTTP | 18 | DB/-/-/-/npm/-/scr/cur | test:blessboard:member-registration |
| `blessboard-members-schema.test.js` | BB | DB | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:members-schema |
| `blessboard-network-support-registration.test.js` | BB | route/HTTP | 6 | DB/-/-/-/npm/-/scr/cur | test:blessboard:network-support-registration |
| `blessboard-otp-foundation.test.js` | BB | DB | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:otp-foundation |
| `blessboard-p0-publish-auth.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-p1-image-persistence.test.js` | BB | repository+route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-participation.test.js` | BB | route/HTTP | 11 | DB/-/-/-/npm/-/scr/cur | test:blessboard:participation |
| `blessboard-pastoral-welfare.test.js` | BB | repository+DB | 14 | DB/-/-/-/npm/-/scr/cur | test:blessboard:pastoral-welfare |
| `blessboard-phase2-056-security.test.js` | BB | security+route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-phase7-editors.test.js` | BB | repository+route/HTTP | 15 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-phase7-public-density-audit.test.js` | BB | repository+route/HTTP | 14 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-phase7-remediation.test.js` | BB | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-phase7-visual-stitch.test.js` | BB | browser/E2E+repository | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-phone-first-forms.test.js` | BB | repository | 7 | DB/-/-/-/npm/-/scr/cur | test:blessboard:phone-first-forms |
| `blessboard-phone-identity-foundation.test.js` | BB | DB | 10 | DB/-/-/-/npm/-/scr/cur | test:blessboard:phone-identity-foundation |
| `blessboard-phone-invitation-sharing.test.js` | BB | unit | 3 | -/-/-/-/npm/-/scr/cur | test:blessboard:phone-invitation-sharing |
| `blessboard-phone-login.test.js` | BB | integration | 6 | DB/-/-/-/npm/-/scr/cur | test:blessboard:phone-login |
| `blessboard-phone-otp-workflows.test.js` | BB | integration | 3 | DB/-/-/-/npm/-/scr/cur | test:blessboard:phone-otp-workflows |
| `blessboard-platform-01-registration.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-platform-account-recovery.test.js` | BB | repository+DB+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-account-recovery |
| `blessboard-platform-admin-directory.test.js` | BB | DB+route/HTTP | 15 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-admin-directory |
| `blessboard-platform-admin-integration.test.js` | BB | DB+route/HTTP+integration | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-admin-integration |
| `blessboard-platform-admin-login-diagnosis.test.js` | BB | DB+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-platform-admin-mobile-nav.test.js` | BB | route/HTTP | 13 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-platform-admin-registration-nav.test.js` | BB | repository+route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-platform-admin-shell.test.js` | BB | repository+DB+route/HTTP | 17 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-admin-shell |
| `blessboard-platform-admin-team.test.js` | BB | DB+route/HTTP | 11 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-admin-team |
| `blessboard-platform-deployments-system.test.js` | BB | route/HTTP | 3 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-deployments-system |
| `blessboard-platform-domains-links.test.js` | BB | route/HTTP | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-domains-links |
| `blessboard-platform-roles-access.test.js` | BB | RBAC+route/HTTP | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-roles-access |
| `blessboard-platform-settings.test.js` | BB | route/HTTP | 4 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-settings |
| `blessboard-platform-support-mode.test.js` | BB | DB+route/HTTP | 14 | DB/-/-/-/npm/-/scr/cur | test:blessboard:platform-support-mode |
| `blessboard-production-registration-p1.test.js` | BB | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-prompt7-stage1-website-governance.test.js` | BB | repository | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-prompt7-stage2-website-settings.test.js` | BB | route/HTTP | 24 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-prompt7-stage3-website-settings-editor.test.js` | BB | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-provision-cli-safety.test.js` | BB | DB | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:provision-cli-safety |
| `blessboard-provision-registered-orchestrator.test.js` | BB | repository+DB+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-provisioning-tx-composability.test.js` | BB | DB | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-public-content-schema.test.js` | BB | DB | 10 | DB/-/-/-/npm/-/scr/cur | test:blessboard:public-content-schema |
| `blessboard-public-pages.test.js` | BB | route/HTTP | 46 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:public-pages |
| `blessboard-public-website-navigation.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-qa-browser-login.test.js` | BB | browser/E2E+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-qa-role-users.test.js` | BB | unit | 4 | -/-/-/-/npm/-/scr/cur | test:blessboard:qa-role-users |
| `blessboard-rbac-e2e.test.js` | BB | repository+RBAC+DB | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:rbac-e2e |
| `blessboard-rbac-foundation.test.js` | BB | repository+RBAC+DB | 15 | DB/-/-/-/npm/-/scr/cur | test:blessboard:rbac-foundation |
| `blessboard-register-church.test.js` | BB | repository+route/HTTP | 21 | DB/-/-/-/npm/-/scr/cur | test:blessboard:register-church |
| `blessboard-registration-application-communication-service.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-application-communications-storage.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-registration-applications-filter-normalization.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-approval-checklist-ui.test.js` | BB | unit | 16 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-approval-checklist.test.js` | BB | unit | 19 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-approval-flow-ui.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-approval-invitation.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-approval-invitation |
| `blessboard-registration-approval-provision-fix.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-communications-history-ui.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-data-environment.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-checklist-load.test.js` | BB | repository | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-communications-load.test.js` | BB | repository | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-overview.test.js` | BB | unit | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-phone-verification-load.test.js` | BB | repository | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-recommendation-load.test.js` | BB | repository | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-detail-verification-load.test.js` | BB | unit | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-comparison-screen.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-decision-route.test.js` | BB | route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-decision-service.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-evidence-facts.test.js` | BB | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-match-query-integration.test.js` | BB | repository+route/HTTP+integration | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-match-query.test.js` | BB | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-match-storage.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-matches-route.test.js` | BB | route/HTTP | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-matches-screen.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-normalization.test.js` | BB | unit | 22 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-duplicate-scoring.test.js` | BB | unit | 25 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-ownership-facts.test.js` | BB | repository | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-delivery.test.js` | BB | unit | 9 | -/NET/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-message.test.js` | BB | unit | 8 | -/NET/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-public-route.test.js` | BB | route/HTTP | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-resend-route.test.js` | BB | route/HTTP | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-service.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-storage.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-registration-email-verification-ui.test.js` | BB | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-identity-idempotency.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-information-request-form.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-information-request-route.test.js` | BB | route/HTTP | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-onboarding-analytics.test.js` | BB | repository+route/HTTP | 10 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-onboarding-analytics |
| `blessboard-registration-operator-approval.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-operator-approval |
| `blessboard-registration-operator-presenter.test.js` | BB | unit | 13 | -/-/-/-/npm/-/scr/cur | test:blessboard:registration-operator-approval |
| `blessboard-registration-phase5-final-completion-ui.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone-verification-attempt-route.test.js` | BB | route/HTTP | 27 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone-verification-form.test.js` | BB | unit | 13 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone-verification-service.test.js` | BB | route/HTTP | 26 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone-verification-storage.test.js` | BB | repository+route/HTTP | 19 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone-verification-ui.test.js` | BB | unit | 14 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-phone.test.js` | BB | repository+route/HTTP | 13 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-phone |
| `blessboard-registration-public-miniwebsite.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-queue-presentation.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-queue-view-parity.test.js` | BB | repository | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-recommendation-ui.test.js` | BB | unit | 17 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-reject-route.test.js` | BB | route/HTTP | 18 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-rejection-flow-ui.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-rejection-service-pg.test.js` | BB | repository+route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-rejection-service.test.js` | BB | repository | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-rejection-workspace-ui.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-reopen-route.test.js` | BB | route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-reopen-service.test.js` | BB | repository | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-request-information-flow-ui.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-review-recommendation.test.js` | BB | unit | 23 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-risk-review.test.js` | BB | repository+route/HTTP | 10 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-risk-review |
| `blessboard-registration-schema-mismatch.test.js` | BB | repository | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-status-presentation.test.js` | BB | unit | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-trace.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/scr/cur | test:blessboard:registration-trace |
| `blessboard-registration-verification-facts.test.js` | BB | unit | 32 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-registration-verification-ui.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-reports-audit.test.js` | BB | route/HTTP | 9 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:reports-audit |
| `blessboard-settings.test.js` | BB | route/HTTP | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:settings |
| `blessboard-shadow-log-validator.test.js` | BB | integration | 17 | DB/-/-/-/npm/-/scr/cur | test:blessboard:shadow-log-validator |
| `blessboard-staff-access.test.js` | BB | repository+RBAC+DB | 30 | DB/-/-/-/npm/-/scr/cur | test:blessboard:staff-access |
| `blessboard-staff-invitation.test.js` | BB | route/HTTP | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:staff-invitation |
| `blessboard-support-follow-up-ops.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/-/npm/-/scr/cur | test:blessboard:support-follow-up-ops |
| `blessboard-tenant-auth.test.js` | BB | route/HTTP | 15 | DB/-/-/-/npm/-/scr/cur | test:blessboard:tenant-host-login |
| `blessboard-tenant-context-website-routes.test.js` | BB | repository+route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-tenant-routing-mode.test.js` | BB | host/routing | 25 | -/-/-/-/npm/-/scr/cur | test:blessboard:tenant-routing |
| `blessboard-tenant-routing.test.js` | BB | host/routing+DB+route/HTTP | 32 | DB/-/-/-/npm/-/scr/cur | test:blessboard:tenant-routing |
| `blessboard-test-users-seed.test.js` | BB | repository+route/HTTP | 18 | DB/-/-/-/npm/-/scr/cur | test:blessboard:test-users-seed |
| `blessboard-testing-demo-content-seed.test.js` | BB | repository | 23 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:testing-demo-content-seed |
| `blessboard-testing-maintenance.test.js` | BB | repository+DB+route/HTTP | 18 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:testing-maintenance |
| `blessboard-testing-org-purge.test.js` | BB | repository+route/HTTP | 7 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:testing-org-purge |
| `blessboard-user-password-reset.test.js` | BB | repository+security | 11 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-v1-blocker-and-bugs-04-06.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v1-reg-07-success-screen.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v1-registration-fixes.test.js` | BB | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v1-registration-review-matrix.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v5-a11y-structure.test.js` | BB | unit | 84 | DB/-/-/DEST/npm/-/scr/cur | test:blessboard:a11y-structure |
| `blessboard-v5-csrf-action-audit.test.js` | BB | security+route/HTTP | 18 | -/-/-/-/npm/-/scr/cur | test:blessboard:csrf-action-audit |
| `blessboard-v5-fixtures.test.js` | BB | unit | 6 | -/-/-/-/npm/-/scr/cur | test:blessboard:precommit-fast |
| `blessboard-v5-frontend-assets.test.js` | BB | unit | 16 | -/-/-/-/npm/-/scr/cur | test:blessboard:frontend-assets |
| `blessboard-v5-input-output-safety.test.js` | BB | security | 10 | -/-/-/-/npm/-/scr/cur | test:blessboard:input-output-safety |
| `blessboard-v5-mobile-burger-browser.test.js` | BB | browser/E2E+DB | 1 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `blessboard-v5-mobile-burger-nav.test.js` | BB | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v5-mobile-drawer-menu.test.js` | BB | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-v5-responsive-structure.test.js` | BB | unit | 9 | -/-/-/DEST/npm/-/scr/cur | test:blessboard:responsive-structure |
| `blessboard-v5-route-link-audit.test.js` | BB | route/HTTP | 32 | -/-/-/-/npm/-/scr/cur | test:blessboard:route-link-audit |
| `blessboard-v5-server-query-audit.test.js` | BB | repository | 5 | -/-/-/-/npm/-/scr/cur | test:blessboard:server-query-audit |
| `blessboard-website-branding.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-draft-review-publish.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-editing-completeness.test.js` | BB | unit | 22 | -/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-inline-edit.test.js` | BB | repository+route/HTTP | 14 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-management-hub-parity.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mobile-editing.test.js` | BB | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode-admin-nav.test.js` | BB | route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode-discovery.test.js` | BB | route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode-preview.test.js` | BB | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode-public-routing.test.js` | BB | host/routing+route/HTTP | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode-transition.test.js` | BB | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-mode.test.js` | BB | integration | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-scope.test.js` | BB | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-website-structured-editors.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `blessboard-write-maintenance.test.js` | BB | route/HTTP | 9 | DB/-/-/-/npm/-/scr/cur | test:blessboard:write-maintenance |
| `bootstrap-provenance.test.js` | BB | integration | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `bootstrap-skip-dotenv-production.test.js` | SHARED | unit | 1 | -/-/-/-/npm/-/wild/cur | npm test |
| `brand-home-stability.spec.js` | SHARED | browser/E2E | 1 | -/-/-/-/-/CI/wild/cur | manual |
| `build-public-geo-locals.test.js` | SHARED | route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `canonical-tenants-bootstrap.test.js` | SHARED | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-add-branch.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-admin-list-pagination.test.js` | BB | integration | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-attach-tenant-by-host.test.js` | BB | host/routing | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-attachment-lifecycle.test.js` | BB | unit | 5 | -/-/-/DEST/npm/-/scr/cur | test:church:db |
| `church-audit-trail.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-audit-viewer.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-auth.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-background-jobs.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-backup-verification.test.js` | BB | route/HTTP | 14 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-blessboard-admin-host.test.js` | BB | host/routing+route/HTTP | 31 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-blessboard-canonical-redirect.test.js` | BB | route/HTTP | 5 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-demo-seed.test.js` | BB | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-env-isolation.test.js` | BB | tenant-isolation+route/HTTP | 7 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-org-apex.test.js` | BB | host/routing+route/HTTP | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-org-canonical-redirect.test.js` | BB | route/HTTP | 15 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-org-db-isolation.test.js` | BB | tenant-isolation+DB | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-runtime-isolation.test.js` | BB | tenant-isolation+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-blessboard-subdomains.test.js` | BB | route/HTTP | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-branch-activation-policy.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-admin-account-security.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-admin-password-reset-requests.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-admin.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-announcement-attachments.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/scr/cur | test:church:db |
| `church-branch-announcements-events.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/scr/cur | test:church:db |
| `church-branch-attendance-giving.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-duty-roster.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-edit.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-giving-settings.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-hq-csrf-coverage.test.js` | BB | security+route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-branch-leaders.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-member-directory.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-ministries.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-ministry-activity.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-monthly-reports.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-path-routing.test.js` | BB | host/routing+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-request-processing.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-reset-requests-inbox.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branch-website-editor.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-branding.test.js` | BB | route/HTTP | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-broadcast-announcement-enhancements.test.js` | BB | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-broadcast-security-analytics.test.js` | BB | security+route/HTTP | 6 | -/-/-/DEST/npm/-/scr/cur | test:church:db |
| `church-canonical-package-provisioning.test.js` | BB | unit | 14 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-classic-admin-mobile-nav.test.js` | BB | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-commercial-catalogue.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-content-management.test.js` | BB | route/HTTP | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-controlled-pilot-rehearsal.test.js` | BB | integration | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-cross-branch-comparison.test.js` | BB | integration | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-data-environment.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-database-identity.test.js` | BB | DB | 28 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-db-resilience.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-demo-branch-admin-script.test.js` | BB | integration | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-deployment-demo-visibility.test.js` | BB | integration | 8 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-existing-session-status-enforcement.test.js` | BB | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-failure-states.test.js` | BB | route/HTTP | 20 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-foundation-attendance.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-foundation-basic-reports.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-foundation-growth-a11y.test.js` | BB | unit | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-foundation-growth-regression.test.js` | BB | route/HTTP | 40 | -/-/-/-/npm/-/scr/cur | test:church:pilot-smoke |
| `church-foundation-pastoral-care.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-foundation-workflows.test.js` | BB | route/HTTP+integration | 12 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-advanced-attendance.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-advanced-events.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-advanced-reporting.test.js` | BB | integration | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-growth-appointments-surveys.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-billing.test.js` | BB | integration | 13 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-growth-e2e-flows.test.js` | BB | DB+integration | 3 | DB/-/-/-/npm/-/scr/cur | test:e2e:growth |
| `church-growth-groups-discipleship-volunteers.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-multi-branch.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-pastoral-automation.test.js` | BB | route/HTTP | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-growth-scheduled-job-safety.test.js` | BB | unit | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-growth-trial.test.js` | BB | integration | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-host.test.js` | BB | host/routing | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-hq-admin-account-security.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-hq-admin-account.test.js` | BB | integration | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-hq-admin-password-reset-requests.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-hq-analytics.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-hq-audit-broadcast-visual.test.js` | BB | route/HTTP | 7 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-hq-branch-registry.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-hq-broadcasts.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/scr/cur | test:church:db |
| `church-hq-reports.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-leader-attendance-notes-visual.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-leader-dashboard-roster-visual.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-leader-join-request-review.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-login-protection.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-low-bandwidth-performance.test.js` | BB | integration | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-member-account-security.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-member-announcement-mark-read.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-member-csrf-coverage.test.js` | BB | security+route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-member-import.test.js` | BB | integration | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-member-password-reset-requests.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-member-portal.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-ministry-join-requests.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-ministry-leader-password-reset-requests.test.js` | BB | security+route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-ministry-leader.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-mutation-csrf-inventory.test.js` | BB | security+route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-mvp-placeholder-screens.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-notification-templates.test.js` | BB | route/HTTP | 8 | -/NET/-/DEST/npm/-/wild/cur | npm test |
| `church-onboarding.test.js` | BB | route/HTTP | 11 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-operational-readiness.test.js` | BB | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-organization-dormancy.test.js` | BB | integration | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-organization-edit.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-package-assignment.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-package-entitlements.test.js` | BB | unit | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-package-feature-gates.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-package-usage-page.test.js` | BB | route/HTTP | 7 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-package-usage.test.js` | BB | integration | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-password-reset-rate-limit.test.js` | BB | security+route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-phase6-attendance-tracker.test.js` | BB | route/HTTP | 7 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-phase6-giving-settings.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-phase6-giving-summary.test.js` | BB | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-phase6-integration-audit.test.js` | BB | integration | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-phase6-members-directory-verification.test.js` | BB | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-pilot-feature-flags.test.js` | BB | integration | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-pilot-launch.test.js` | BB | route/HTTP | 11 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-pilot-readiness-command.test.js` | BB | integration | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-pilot-readiness.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-pilot-smoke-suite.test.js` | BB | unit | 1 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-plan-context-query-count.test.js` | BB | route/HTTP | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-plan-limits.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-admin-console-screens.test.js` | BB | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-admin-csrf-audit.test.js` | BB | security+route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-apex-nav.test.js` | BB | host/routing+route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-branch-admin-management.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-hq-admin-management.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-member-reset-request-detail.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-member-support-actions.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-member-support.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-members-directory.test.js` | BB | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-ministry-leader-support-actions.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-ministry-leader-support.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-org-overview-suspend.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-pricing.test.js` | BB | route/HTTP | 23 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-provisioning.test.js` | BB | route/HTTP | 3 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-public-faq.test.js` | BB | route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-public-forms.test.js` | BB | route/HTTP | 15 | -/NET/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-public-launch.test.js` | BB | route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-public-legal.test.js` | BB | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-public-pages.test.js` | BB | route/HTTP | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-platform-public-seo.test.js` | BB | route/HTTP | 14 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-platform-reset-requests-inbox.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-security.test.js` | BB | security+route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-support-access.test.js` | BB | integration | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-support-notes-search.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-support-notes.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-platform-support-search.test.js` | BB | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-public-about-leadership-visual.test.js` | BB | route/HTTP | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-public-church-selection.test.js` | BB | route/HTTP | 14 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-public-directory-cards.test.js` | BB | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-public-events-sermons-visual.test.js` | BB | route/HTTP | 14 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-public-foundation.test.js` | BB | DB+route/HTTP | 16 | DB/-/-/-/npm/-/wild/cur | npm test |
| `church-public-giving-contact-visual.test.js` | BB | route/HTTP | 10 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-public-home-ministries-regression.test.js` | BB | route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-public-ministries-visual.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-quota-concurrency.test.js` | BB | integration | 15 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-quota-warnings.test.js` | BB | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-release-register.test.js` | BB | route/HTTP | 6 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-reset-request-badges.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-reset-request-timeline.test.js` | BB | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-scheduled-broadcasts.test.js` | BB | integration | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-scheduled-delivery-query-count.test.js` | BB | integration | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-scheduled-reports.test.js` | BB | integration | 2 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-seat-quota.test.js` | BB | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-selection-verification.test.js` | BB | route/HTTP | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-session-csrf-join-requests.test.js` | BB | security+route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-session-security-version.test.js` | BB | security+route/HTTP | 1 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-status-management.test.js` | BB | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-stitch-auth.test.js` | BB | route/HTTP | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-stitch-branch-admin.test.js` | BB | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-stitch-member.test.js` | BB | route/HTTP | 8 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-stitch-platform-admin.test.js` | BB | route/HTTP | 13 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-support-diagnostic.test.js` | BB | route/HTTP | 12 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-tenant-header-branding.test.js` | BB | route/HTTP | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-tenant-homepage-visual.test.js` | BB | route/HTTP | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-tenant-homepage.test.js` | BB | route/HTTP | 7 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `church-tenant-nav.test.js` | BB | route/HTTP | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-test-db-config.test.js` | BB | DB | 7 | DB/-/-/-/npm/-/scr/cur | test:church:focused |
| `church-unified-login-hardening.test.js` | BB | route/HTTP | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-unified-login-suspended-org.test.js` | BB | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `church-unified-tenant-login.test.js` | BB | route/HTTP | 6 | -/NET/-/-/npm/-/wild/cur | npm test |
| `church-v5-deploy-init.test.js` | BB | integration | 13 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `church-visual-design.test.js` | BB | route/HTTP | 32 | -/-/-/-/npm/-/wild/cur | npm test |
| `committed-secret-hygiene.test.js` | PLATFORM | security | 15 | DB/-/-/-/npm/CI/wild/cur | npm test |
| `companies-directory-filters.test.js` | SHARED | integration | 1 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `company-field-agent-linkage.test.js` | SHARED | integration | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `db-bootstrap-foundation.test.js` | PLATFORM | DB | 18 | DB/-/-/-/npm/-/scr/cur | test:db:bootstrap-foundation |
| `db-foundation.test.js` | PLATFORM | DB | 16 | DB/-/-/-/npm/-/scr/cur | test:db:foundation |
| `deployment-application-compatibility.test.js` | AC | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `deployment-brand-subtitle.test.js` | BB | integration | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `deployment-profiles.test.js` | AC | integration | 40 | DB/-/-/-/npm/-/wild/cur | npm test |
| `directory-search-ui-filters.test.js` | SHARED | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `directory-speciality-autocomplete.test.js` | SHARED | integration | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `e2e/foundation-security.spec.js` | BB | browser/E2E+security+integration | 8 | -/-/-/-/-/CI/wild/cur | manual |
| `field-agent-add-contact-submit.test.js` | SHARED | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-adjustments.test.js` | SHARED | integration | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-authed-post-rate-limit.test.js` | SHARED | route/HTTP | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `field-agent-console-routes.test.js` | SHARED | route/HTTP | 40 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-dashboard-api.test.js` | SHARED | route/HTTP | 9 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-dashboard-sp-payable-modal.test.js` | SHARED | route/HTTP | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-disputes.test.js` | SHARED | route/HTTP | 7 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-ec-commission-quality-payable.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `field-agent-ec-commission.test.js` | SHARED | route/HTTP | 11 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-info-needed-feedback.test.js` | SHARED | route/HTTP | 3 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-moderation-integration.test.js` | SHARED | route/HTTP+integration | 9 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-pay-run-carry-forward.test.js` | SHARED | integration | 5 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-sp-commission-quality-payable.test.js` | SHARED | unit | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `field-agent-sp-commission.test.js` | SHARED | integration | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-sp-rating.test.js` | SHARED | route/HTTP | 4 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-statements.test.js` | SHARED | route/HTTP | 6 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `field-agent-submission-photos-to-company.test.js` | SHARED | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `field-agent-submission-statuses.test.js` | SHARED | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `field-agent.test.js` | SHARED | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `host-tenant-mapping.test.js` | SHARED | host/routing | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `hq-broadcast-center-v2.test.js` | BB | route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `hq-website-broadcasts-empty-fix.test.js` | BB | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `join-embed-helmet.test.js` | SHARED | route/HTTP | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `local-env-safety.test.js` | BB | integration | 18 | DB/-/-/-/npm/-/wild/cur | npm test |
| `marketing-operational-urls.test.js` | SHARED | unit | 9 | -/NET/-/-/npm/-/wild/cur | npm test |
| `member-notification-preferences.test.js` | BB | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `member-notifications.test.js` | BB | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `migration-mapping.test.js` | PLATFORM | migration | 14 | DB/-/-/-/npm/-/scr/cur | test:migration:mapping |
| `migration-tooling.test.js` | PLATFORM | migration | 11 | DB/-/-/-/npm/-/scr/cur | test:migration:tooling |
| `normalize-sp-rating-thresholds.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `pg-env-diagnostics.test.js` | PLATFORM | DB | 11 | DB/-/-/-/npm/-/scr/cur | test:church:focused |
| `pgTestSeed.test.js` | SHARED | integration | 1 | -/-/-/DEST/npm/-/wild/cur | npm test |
| `phase3-branch-website-submissions.test.js` | BB | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-publication-confirmation.test.js` | BB | repository+route/HTTP | 10 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `phase3-submission-review-comments.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-approval-settings.test.js` | BB | repository+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-audit-log.test.js` | BB | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-change-submissions.test.js` | BB | repository+route/HTTP | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-edit-conflict.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-publishing-history.test.js` | BB | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-version-compare-restore.test.js` | BB | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-version-history.test.js` | BB | repository+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase3-website-workflow-dashboard.test.js` | BB | repository+route/HTTP+integration | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase4-publish-website.test.js` | BB | repository+route/HTTP | 21 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `phase4-recent-website-changes.test.js` | BB | repository+route/HTTP | 19 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `phase4-restore-previous-website.test.js` | BB | repository+route/HTTP | 20 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `phase4-system-states.test.js` | BB | route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase4-website-governance-stages4-5.test.js` | BB | repository+route/HTTP | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase4-website-overviews.test.js` | BB | repository+route/HTTP | 20 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phase4-website-plan-entitlements.test.js` | BB | route/HTTP | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `phone-rules.test.js` | SHARED | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `platform-deployment-code-string.test.js` | PLATFORM | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `platform-diagnostic-integration.test.js` | PLATFORM | DB+integration | 1 | DB/-/-/-/npm/-/scr/cur | test:platform:diagnostic-integration |
| `platform-entitlements.test.js` | PLATFORM | integration | 17 | DB/-/-/-/npm/-/scr/cur | test:platform:entitlements |
| `platform-host-comparison.test.js` | PLATFORM | host/routing | 24 | -/-/-/-/npm/-/scr/cur | test:platform:host-comparison |
| `platform-host-context-middleware.test.js` | PLATFORM | host/routing+route/HTTP | 22 | -/-/-/-/npm/-/scr/cur | test:platform:http-context |
| `platform-hostname-resolution.test.js` | PLATFORM | repository+host/routing+DB | 26 | DB/-/-/-/npm/-/scr/cur | test:platform:resolution |
| `platform-identity-foundation.test.js` | PLATFORM | DB | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `platform-tenant-provisioning.test.js` | PLATFORM | repository+DB | 21 | DB/-/-/-/npm/-/scr/cur | test:platform:provisioning |
| `platform-v5-sessions.test.js` | PLATFORM | integration | 5 | DB/-/-/-/npm/-/scr/cur | test:platform:sessions |
| `platform-website-engine.test.js` | PLATFORM | integration | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `platform-website-lifecycle-moderation.test.js` | PLATFORM | integration | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `production-catalogue-seed-hygiene.test.js` | AC | integration | 7 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `production-env-file-fallback.test.js` | SHARED | integration | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `production-env-gate.test.js` | BB | integration | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `run-with-blessboard-env.test.js` | BB | integration | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `seasonal-category-boosts.test.js` | SHARED | unit | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `server-missing-db-exit.test.js` | SHARED | integration | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave1.test.js` | SHARED | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave2.test.js` | SHARED | repository+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave3.test.js` | SHARED | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave4a.test.js` | SHARED | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave4b1.test.js` | SHARED | repository+route/HTTP | 16 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-editor-wave4b2.test.js` | SHARED | repository+route/HTTP | 16 | DB/-/-/-/npm/-/wild/cur | npm test |
| `shared-website-section-lifecycle.test.js` | SHARED | unit | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `site-footer-optional-locals.test.js` | SHARED | unit | 1 | -/-/-/-/npm/-/wild/cur | npm test |
| `static-asset-cache-headers.test.js` | BB | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `tenant-host-routing.test.js` | SHARED | host/routing | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `tenant-option-lists.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `tenant-routing.test.js` | SHARED | host/routing | 2 | -/-/-/-/npm/-/scr/cur | test:blessboard:tenant-routing |
| `ui.spec.js` | SHARED | browser/E2E | 7 | -/-/-/-/-/CI/wild/cur | manual |
| `v10-dbcl04-canonical-cleanup-baseline.test.js` | PLATFORM | repository+DB | 19 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-dbcl07-registration-status-cleanup.test.js` | PLATFORM | unit | 12 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-dbcl08-schema-lag-review.test.js` | PLATFORM | repository+DB | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-dbcl09-legacy-server-review.test.js` | PLATFORM | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-dbcl10-post-cutover-dead-code.test.js` | PLATFORM | repository | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-dbcl11-post-cleanup-fresh-bootstrap.test.js` | PLATFORM | repository+DB | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc02-platform-consolidation-characterization.test.js` | PLATFORM | route/HTTP | 22 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc03-platform-product-dependency-direction.test.js` | PLATFORM | unit | 2 | -/-/-/-/npm/-/scr/cur | test:architecture |
| `v10-pc06-platform-schema-ownership.test.js` | PLATFORM | unit | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc07-shared-website-editor-http.test.js` | PLATFORM | route/HTTP | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc08-platform-media-consolidation.test.js` | PLATFORM | unit | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc09-platform-ops-ui-primitives.test.js` | PLATFORM | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc10-publication-convergence.test.js` | PLATFORM | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc10b-ac-website-workflow-baseline.test.js` | SHARED | repository+integration | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc10b-bb-publish-baselines.test.js` | SHARED | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc11-cms-convergence.test.js` | PLATFORM | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc15-architecture-guardrails.test.js` | PLATFORM | unit | 5 | -/-/-/-/npm/-/scr/cur | test:architecture |
| `v10-pc18-organization-key-lift.test.js` | PLATFORM | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pc19-cross-product-dependency-zero.test.js` | PLATFORM | tenant-isolation | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pl04-canonical-publication.test.js` | PLATFORM | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pl05-canonical-cms.test.js` | PLATFORM | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v10-pl06-legacy-infra-cleanup.test.js` | PLATFORM | unit | 8 | -/-/-/-/npm/-/wild/obs | npm test |
| `v10-pl07-canonical-migration-baseline.test.js` | PLATFORM | migration+DB | 8 | DB/-/-/-/npm/-/scr/cur | test:db:canonical-migration-baseline |
| `v10-pl08-canonical-repository-cleanup.test.js` | PLATFORM | repository | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v10-pl09-fresh-db-bootstrap.test.js` | PLATFORM | repository+DB | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-bb-inline-editor-parity.test.js` | SHARED | repository | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-field-history-restore.test.js` | SHARED | unit | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-first-additional-themes.test.js` | SHARED | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-publish-error-diagnostics.test.js` | SHARED | repository | 25 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-release-notes-center.test.js` | SHARED | route/HTTP | 39 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-hq-branch-website.test.js` | SHARED | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-image-payload-contract.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-image-placement.test.js` | SHARED | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-section-management.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-theme-gallery.test.js` | SHARED | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-shared-theme-infra.test.js` | SHARED | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-sp-vis-reminder-pubfail.test.js` | SHARED | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-toolbar-reminders.test.js` | SHARED | unit | 13 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-universal-image-editor.test.js` | SHARED | unit | 6 | -/NET/-/-/npm/-/wild/cur | npm test |
| `v2-01-unpublished-changes-panel.test.js` | SHARED | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-01-website-change-manager-foundation.test.js` | SHARED | DB | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-ac-rbac-alignment.test.js` | SHARED | RBAC+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-bb-catalogue-only-rbac.test.js` | SHARED | RBAC | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-legacy-rbac-removal.test.js` | SHARED | repository+RBAC | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-phase-a-user-roles-backfill.test.js` | SHARED | repository | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-platform-admin-rbac-convergence.test.js` | PLATFORM | RBAC | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-02-platform-rbac-foundation.test.js` | PLATFORM | repository+RBAC+DB | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v2-03-platform-shared-foundation.test.js` | PLATFORM | DB | 11 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `v2-ac-doctor-image-upload.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-ac-service-card-editing.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-about-default-images.test.js` | BB | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-about-image-isolation.test.js` | BB | tenant-isolation | 8 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-contact-hours-edit.test.js` | BB | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-contact-image-replace.test.js` | BB | unit | 3 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-home-leaders-image.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-home-leaders-text.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-leadership-data-loss.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-leadership-section-management.test.js` | BB | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-ministry-image-edit.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-ministry-leader-image.test.js` | BB | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-season-image-edit.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-bb-sermon-image-persistence.test.js` | BB | repository | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-shared-media-type-conversion.test.js` | SHARED | unit | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-shared-media-upload-parity.test.js` | SHARED | unit | 7 | -/-/-/-/npm/-/wild/cur | npm test |
| `v2-zambia-phone-validation.test.js` | AC | unit | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v5-environment-validation.test.js` | PLATFORM | unit | 25 | DB/-/-/-/npm/-/scr/cur | test:v5:environment |
| `v5-foundation-startup.test.js` | PLATFORM | route/HTTP | 16 | DB/-/-/-/npm/-/scr/obs | test:v5:foundation-startup |
| `v5-logging-sensitive-data.test.js` | PLATFORM | route/HTTP | 14 | DB/-/-/DEST/npm/-/scr/cur | test:v5:logging-sensitive |
| `v5-session-auth-intermittent.test.js` | SHARED | unit | 11 | -/-/-/-/npm/-/wild/cur | npm test |
| `v5-to-v7-migration-tooling.test.js` | PLATFORM | migration | 26 | DB/-/-/-/npm/-/scr/cur | test:migration:v5-to-v7 |
| `v7-ac-qa-wave2-media-unit.test.js` | SHARED | unit | 2 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-activeclinic-invitation-env-parity.test.js` | AC | unit | 7 | -/NET/-/-/npm/-/wild/cur | npm test |
| `v7-activeclinic-website-template.test.js` | AC | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-auth-reg-stitch-parity.test.js` | SHARED | browser/E2E | 24 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-bb-ac-phone-parity.test.js` | AC | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-bb-form-phone-split.test.js` | SHARED | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-bb-mobile-editor-pointer.test.js` | SHARED | browser/E2E | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-bb-publish-validation.test.js` | SHARED | repository | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-csrf-context.test.js` | BB | security+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-directory-publish.test.js` | BB | repository+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-publish-engine-bridge.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-shared-website-engine.test.js` | BB | repository+route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-website-engine-convergence.test.js` | BB | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-blessboard-website-template.test.js` | BB | repository | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-branch-admin-website-entry-assigned-branch.test.js` | SHARED | route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-branch-editor-canonical-actions.test.js` | SHARED | route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-branch-website-inline-save.test.js` | SHARED | repository+route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-bug-fixes-04-registration-website.test.js` | SHARED | integration | 17 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-bugs-01-04.test.js` | SHARED | repository+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-bugs-04-09-website-editor.test.js` | SHARED | repository+route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-bugs-05-08-registration-ux.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-bugs-09-registration-lifecycle.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-bugs-10-15-registration.test.js` | SHARED | route/HTTP | 9 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-classic-cms-media-order-drafts.test.js` | SHARED | repository | 8 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `v7-clinic-website-autonomy-acceptance.test.js` | AC | route/HTTP | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-color-system-consolidation.test.js` | SHARED | unit | 14 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-default-website-template-qa.test.js` | SHARED | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-deployment-env-mode.test.js` | SHARED | repository+route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-domain-resolved-platform.test.js` | SHARED | route/HTTP | 16 | -/NET/-/-/npm/-/wild/cur | npm test |
| `v7-getpro-testing-foundation.test.js` | SHARED | DB+route/HTTP | 7 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `v7-hosted-testing-sha.test.js` | SHARED | host/routing | 7 | -/NET/HOST/-/npm/-/scr/cur | test:v7:deploy-sha |
| `v7-hostinger-env-source-diagnostics.test.js` | SHARED | host/routing | 8 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `v7-hostinger-media-storage.test.js` | SHARED | host/routing+route/HTTP | 14 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `v7-hostinger-testing-runtime.test.js` | SHARED | host/routing+route/HTTP | 15 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-image-cdn-delivery.test.js` | SHARED | integration | 7 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `v7-image-editor-coverage.test.js` | SHARED | unit | 17 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-image-legacy-reference-cleanup.test.js` | SHARED | unit | 8 | -/NET/-/-/npm/-/wild/cur | npm test |
| `v7-inline-editor-coverage.test.js` | SHARED | repository+route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-layout-family-contract.test.js` | SHARED | browser/E2E | 13 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-local-registration-to-website-e2e.test.js` | SHARED | repository+DB+route/HTTP | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-migrate-identity-gate.test.js` | PLATFORM | migration+DB+route/HTTP | 17 | DB/-/-/DEST/npm/-/scr/cur | test:v7:runtime-schema |
| `v7-minisite-alignment-color.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-navigation-route-debt.test.js` | SHARED | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-new-church-operational-readiness.test.js` | BB | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-new-clinic-operational-readiness.test.js` | AC | route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-new-tenant-provisioning.test.js` | SHARED | repository+DB+route/HTTP | 2 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-organization-admin-console-parity.test.js` | SHARED | route/HTTP | 3 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-phone-login-p2-nojs.test.js` | SHARED | route/HTTP | 20 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-phone-login-tab-http.test.js` | SHARED | route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-platform-admin-tenant-health.test.js` | PLATFORM | integration | 7 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `v7-platform-admin-website-control.test.js` | PLATFORM | repository+DB+route/HTTP | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-provisioning-recovery.test.js` | SHARED | integration | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-public-media-alt-text-rendering.test.js` | SHARED | unit | 10 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-public-performance-assets.test.js` | SHARED | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-public-website-url-hardening.test.js` | SHARED | route/HTTP | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-registration-website-audit-trail.test.js` | SHARED | repository | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-runtime-env-isolation.test.js` | SHARED | tenant-isolation+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-runtime-schema-compatibility.test.js` | SHARED | repository+route/HTTP | 38 | DB/-/-/DEST/npm/-/scr/cur | test:v7:runtime-schema |
| `v7-shared-auth-reg.test.js` | PLATFORM | unit | 4 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-content-media-library.test.js` | PLATFORM | unit | 39 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-media-folders.test.js` | PLATFORM | unit | 44 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-phone-identity.test.js` | PLATFORM | integration | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-registration-country-selection.test.js` | PLATFORM | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-seo-expansion.test.js` | PLATFORM | unit | 43 | -/NET/-/DEST/npm/-/wild/cur | npm test |
| `v7-shared-website-authorization-entrypoint.test.js` | PLATFORM | RBAC | 14 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-website-editor-persistence.test.js` | PLATFORM | repository+route/HTTP | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-website-editor.test.js` | PLATFORM | repository+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-shared-website-governance.test.js` | PLATFORM | repository+route/HTTP | 14 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-tenant-isolation-security.test.js` | SHARED | repository+tenant-isolation+security | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-testing-identity-migration.test.js` | SHARED | migration | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-unified-onboarding.test.js` | SHARED | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-unified-platform.test.js` | SHARED | route/HTTP | 21 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-unified-registration-engine.test.js` | SHARED | integration | 40 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-unified-website-management.test.js` | SHARED | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-unified-website-urls.test.js` | SHARED | unit | 8 | -/NET/-/-/npm/-/wild/cur | npm test |
| `v7-website-catalogue-390px.test.js` | SHARED | browser/E2E+repository+route/HTTP | 1 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-draft-live-integrity.test.js` | SHARED | repository+route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-editable-schema.test.js` | SHARED | repository+DB+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-engine-contract.test.js` | SHARED | integration | 13 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `v7-website-image-management.test.js` | SHARED | repository+route/HTTP | 11 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-mobile-editor.test.js` | SHARED | unit | 6 | -/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-public-catalogue.test.js` | SHARED | repository+route/HTTP | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-rbac.test.js` | SHARED | repository+RBAC+route/HTTP | 4 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v7-website-settings-ux.test.js` | SHARED | repository+route/HTTP | 20 | DB/-/-/DEST/npm/-/wild/cur | npm test |
| `v8-about-version-2.test.js` | SHARED | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bb-activity-registration.test.js` | SHARED | integration | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bb-announcements.test.js` | SHARED | integration | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bb-hq-membership-route.test.js` | SHARED | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bb-membership.test.js` | SHARED | integration | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bb-qa-church-path-public.test.js` | BB | host/routing+route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-bug002-hostinger-upstream-503.test.js` | SHARED | host/routing | 5 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-db-compatibility-baseline.test.js` | PLATFORM | integration | 12 | DB/-/-/-/npm/-/scr/cur | test:v8:db-compat |
| `v8-deployment-profile.test.js` | SHARED | integration | 7 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-environment-isolation.test.js` | PLATFORM | tenant-isolation+route/HTTP | 10 | DB/-/-/-/npm/-/scr/cur | test:v8:env-isolation |
| `v8-hostinger-env-profile-conflict.test.js` | SHARED | host/routing | 13 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-migration-contract.test.js` | PLATFORM | migration+route/HTTP | 7 | DB/-/-/-/npm/-/scr/cur | test:v8:migration-contract |
| `v8-p0-503-diagnosis.test.js` | SHARED | route/HTTP | 6 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-qa-homepage-v2-only.test.js` | SHARED | route/HTTP | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-announcements.test.js` | PLATFORM | integration | 10 | DB/NET/-/-/npm/-/wild/cur | npm test |
| `v8-shared-audit-logging.test.js` | PLATFORM | integration | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-auth-password-security.test.js` | PLATFORM | repository+security | 8 | DB/-/-/-/npm/-/scr/cur | test:v8:auth-security |
| `v8-shared-form-builder.test.js` | PLATFORM | route/HTTP | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-form-studio-authz.test.js` | PLATFORM | repository+route/HTTP | 12 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-forms-e2e.test.js` | PLATFORM | route/HTTP+integration | 9 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-media-resolution.test.js` | PLATFORM | route/HTTP | 21 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-module-coverage.test.js` | PLATFORM | route/HTTP | 14 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-rbac-tenant-isolation.test.js` | PLATFORM | RBAC+tenant-isolation+route/HTTP | 19 | DB/-/-/-/npm/-/scr/cur | test:v8:rbac-isolation |
| `v8-shared-session-security.test.js` | PLATFORM | security+route/HTTP | 18 | DB/-/-/-/npm/-/scr/cur | test:v8:session-security |
| `v8-shared-validation.test.js` | PLATFORM | route/HTTP | 8 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-verification.test.js` | PLATFORM | repository | 5 | DB/-/-/-/npm/-/scr/cur | test:v8:verification |
| `v8-shared-website-lifecycle.test.js` | PLATFORM | integration | 10 | DB/-/-/-/npm/-/wild/cur | npm test |
| `v8-shared-website-sections.test.js` | PLATFORM | integration | 9 | DB/-/-/-/npm/-/scr/cur | test:v8:website-sections |
| `v8-tenant-product-isolation.test.js` | PLATFORM | tenant-isolation | 6 | DB/-/-/-/npm/-/scr/cur | test:v8:tenant-isolation |
| `website-plain-text-entities.test.js` | BB | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `website-ui-completion.test.js` | AC | unit | 5 | -/-/-/-/npm/-/wild/cur | npm test |
| `worker-env-trace.test.js` | SHARED | integration | 2 | DB/-/-/-/npm/-/wild/cur | npm test |

---

## Appendix B — Method

- Generated 2026-09-27 from repository scan (no mutations other than this doc).
- Case counts = regex `it(`/`test(` sites — **approximate**.
- Product/layer/DB/hosted flags = **heuristic**; use for planning, not as a formal contract.
- Machine dump retained locally for regeneration: inventory JSON was produced under `/tmp/qa02/` during QA02 (not committed).

---

## Marker

```text
V203_TEST_INVENTORY_COMPLETE

TOTAL_TEST_FILES: 854
TOTAL_TEST_CASES: 7554
DEFAULT_SUITE_FILES: 851
ORPHAN_TEST_FILES: 59
E2E_TESTS: 21
HOSTED_TESTS: 67
COVERAGE_TOOL: c8
```
