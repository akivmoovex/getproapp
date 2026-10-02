# V2.03 Full Coverage Failure Triage

**Status:** `V2_03_FULL_COVERAGE_FAILURES_TRIAGED`  
**Date:** 2026-09-28  
**Worktree / run:** `getpro-v202-cov-audit`  
**Authoritative log:** `/tmp/v202-total-coverage-run.log`  
**Coverage artifacts:** `coverage/v203/` (not regenerated; not deleted)

## Constraints honored

- Did **not** rerun the 855-file coverage suite
- Did **not** modify application code, tests, or coverage infrastructure
- Did **not** delete or regenerate coverage artifacts
- Production: **UNTOUCHED**

## Executive summary

```text
TOTAL_TEST_FILES=855
TOTAL_PASS=6184
TOTAL_FAIL=452
CANCELLED=0

FAILED_TEST_FILES=187
UNIQUE_FAILURE_SIGNATURES=196
UNIQUE_ROOT_CAUSES=27

FAILURES_BY_CATEGORY:
  D. DATABASE_SCHEMA/IDENTITY=140
  A. STALE_TEST_EXPECTATION=120
  L. OTHER=98
  F. ROUTE/HTTP_CONTRACT=65
  G. AUTH/RBAC=9
  B. TEST_ENVIRONMENT=7
  I. APPLICATION_REGRESSION=6
  H. TENANT_ISOLATION=4
  J. PLAYWRIGHT/UI_ENVIRONMENT=2
  C. MISSING_TEST_PREREQUISITE=1

FAILURES_BY_PRODUCT:
  PLATFORM=62
  BB=320
  AC=51
  CROSS_PRODUCT=19
  INFRA=0

KNOWN_STALE_FAILURES=119  # RC04+RC05+RC06+RC07+RC10+RC22
ENVIRONMENT_FAILURES=10  # RC11+RC12+RC13+RC17
REAL_APPLICATION_FAILURES=18  # P1 only (conservative; evidence incomplete for P0)
UNKNOWN_FAILURES=112  # RC99 + LOW-confidence

P0=0 failures / 0 root causes
P1=18 failures / 5 root causes
P2=166 failures / 7 root causes
P3=149 failures / 9 root causes
TEST_DEBT_ONLY=119 failures / 6 root causes

COVERAGE_DATA_TECHNICALLY_VALID=YES
COVERAGE_REPRESENTATIVE_OF_GREEN_SUITE=NO

PRODUCTION=UNTOUCHED
```

### Multiplication finding

**452 failures are not 452 independent defects.**

- **27 unique root causes** explain all 452 leaf `testCodeFailure` TAP results.
- Top cause alone (**RC01 `branch_name` NOT NULL**) = **114 failures (25.2%)** across **20** BlessBoard test files.
- Top 3 causes (**RC01 + RC10 CSS fingerprint + RC26 mixed value asserts**) = **233 failures (51.5%)**.
- Many HTTP status mismatches are **downstream symptoms** of seed/DB fixture failures or redirect-contract drift, not separate product bugs.

Coverage totals from the same run (unchanged): Statements/Lines **65.71%**, Branches **62.55%**, Functions **65.40%**.

---

## 1. Parse scope

Parsed **every** indented TAP `not ok` from `/tmp/v202-total-coverage-run.log`.

| Metric | Value |
|--|--:|
| Raw `not ok` lines (tests + suite rollups) | 625 |
| Leaf failures (`type: test`, `failureType: testCodeFailure`) | **452** |
| Suite rollups (`subtestsFailed`) | 173 |
| Matches `# fail 452` | YES |
| Failed test files | 187 |
| Unique normalized error signatures | 196 |

Assertion/code distribution (leaf):

| code | count |
|--|--:|
| ERR_ASSERTION | 421 |
| ERR_TEST_FAILURE (incl. TimeoutError / wrapped) | counted inside leaf via failureType |
| PG 23502 (not-null) | 10+ (plus many wrapped as Local PostgreSQL unavailable) |
| PG unique / check on `user_role_assignments` | 23 |
| Other | remainder |

---

## 2. Root-cause groups (primary category A–L)

Each failure assigned **exactly one** primary root cause. Categories below are from that assignment.

### RC01 — 114 failures (25.22%)

- **CATEGORY:** D. DATABASE_SCHEMA/IDENTITY
- **SIGNATURE:** platform_church_registration_applications.branch_name NOT NULL / required (seed + API)
- **FAILURE_COUNT:** 114
- **TEST_FILE_COUNT:** 21
- **PRODUCTS:** {'BLESSBOARD': 114}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Test seeds / registration helpers omit branch_name required by current schema (often wrapped as Local PostgreSQL unavailable)
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-admin-ops-alerts.test.js` — exposes one operational alert per event type from fixtures
  - `tests/blessboard-admin-ops-alerts.test.js` — repeated listing is idempotent (stable alert keys)
  - `tests/blessboard-admin-ops-alerts.test.js` — alert links resolve on authorized platform-admin routes
  - `tests/blessboard-admin-ops-alerts.test.js` — tenant church admin cannot view platform ops alerts
- **FILES:** 21 files (see machine list in triage notes; top examples above)

### RC10 — 78 failures (17.26%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** stale CSS cache-bust fingerprint regex
- **FAILURE_COUNT:** 78
- **TEST_FILE_COUNT:** 57
- **PRODUCTS:** {'ACTIVECLINIC': 14, 'CROSS_PRODUCT': 4, 'BLESSBOARD': 53, 'PLATFORM': 7}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** UI still works; tests pin exact ?v=N which drifts when assets bump
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-acw09-registration.test.js` — GET step 1 is clinic information with desktop/mobile CSS
  - `tests/activeclinic-acw09-registration.test.js` — walks clinic → administrator → review → success on the existing engine
  - `tests/activeclinic-clinic-onboarding.test.js` — GET /register-clinic and /login expose the public onboarding path
  - `tests/activeclinic-foundation-states-parity.test.js` — access overview filtered uses no-results taxonomy
- **FILES:** 57 files (see machine list in triage notes; top examples above)

### RC26 — 41 failures (9.07%)

- **CATEGORY:** L. OTHER
- **SIGNATURE:** value/deep equality assertion failure
- **FAILURE_COUNT:** 41
- **TEST_FILE_COUNT:** 33
- **PRODUCTS:** {'ACTIVECLINIC': 4, 'BLESSBOARD': 32, 'PLATFORM': 5}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** LOW
- **LIKELY_CAUSE:** Mixed behavioral or stale expectation
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-pass6-media.test.js` — maps Julflona doctors deterministically and falls back for nurse
  - `tests/activeclinic-pass6-media.test.js` — uses julflona hero for julflona clinic only
  - `tests/activeclinic-pass6-media.test.js` — enriches locals with consistent doctor photoUrl across list fields
  - `tests/activeclinic-phase13-domain.test.js` — counts refunds once in net collections
- **FILES:** 33 files (see machine list in triage notes; top examples above)

### RC99 — 31 failures (6.86%)

- **CATEGORY:** L. OTHER
- **SIGNATURE:** unclassified
- **FAILURE_COUNT:** 31
- **TEST_FILE_COUNT:** 26
- **PRODUCTS:** {'ACTIVECLINIC': 3, 'BLESSBOARD': 19, 'PLATFORM': 7, 'CROSS_PRODUCT': 2}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** LOW
- **LIKELY_CAUSE:** Needs manual inspection
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-mf08-patient-registration.test.js` — guest booking linkage remains available and does not invent OTP
  - `tests/activeclinic-patient-portal.test.js` — guest token registration links patient and lists only owned bookings
  - `tests/activeclinic-phase12-states.test.js` — major list views use canonical empty markers
  - `tests/blessboard-demo-church-config.test.js` — HTTP: legacy redirect, vanity, canonical, reserved routes, unknown vanity
- **FILES:** 26 files (see machine list in triage notes; top examples above)

### RC22 — 28 failures (6.19%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** HTML/JS shell regex contract drift (non-fingerprint)
- **FAILURE_COUNT:** 28
- **TEST_FILE_COUNT:** 23
- **PRODUCTS:** {'CROSS_PRODUCT': 5, 'ACTIVECLINIC': 8, 'BLESSBOARD': 8, 'PLATFORM': 7}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Public/admin shell markup or copy changed; many are cosmetic/nav/editor hook expectations
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-editor-client-contracts.test.js` — shared lifecycle publish uses urlencoded body and connection failure copy
  - `tests/activeclinic-logout-after-switch.test.js` — Test 8: BlessBoard shared POST /logout CSRF gate is unchanged
  - `tests/activeclinic-mw-stitch-parity.test.js` — CMS screens keep Stitch titles and working upload/publish controls
  - `tests/activeclinic-mw-stitch-parity.test.js` — CMS shell hides staff ops chrome and versions ActiveClinic CSS
- **FILES:** 23 files (see machine list in triage notes; top examples above)

### RC25 — 26 failures (5.75%)

- **CATEGORY:** L. OTHER
- **SIGNATURE:** boolean/assert.ok failure without specific classifier
- **FAILURE_COUNT:** 26
- **TEST_FILE_COUNT:** 19
- **PRODUCTS:** {'ACTIVECLINIC': 3, 'BLESSBOARD': 20, 'PLATFORM': 3}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** LOW
- **LIKELY_CAUSE:** Mixed: needs per-test review
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-acw08-auth.test.js` — platform admin without a clinic is not treated as a bad password
  - `tests/activeclinic-clinic-website-availability.test.js` — F07 content approval does not make the clinic public; PA publish/unpublish does
  - `tests/activeclinic-phase4-billing-ops.test.js` — aggregates revenue report facility-scoped with auth denial
  - `tests/blessboard-foundation-schema-status.test.js` — backfills existing pending rows safely on upgrade path
- **FILES:** 19 files (see machine list in triage notes; top examples above)

### RC09 — 25 failures (5.53%)

- **CATEGORY:** F. ROUTE/HTTP_CONTRACT
- **SIGNATURE:** expected 303 redirect, got 400
- **FAILURE_COUNT:** 25
- **TEST_FILE_COUNT:** 6
- **PRODUCTS:** {'ACTIVECLINIC': 1, 'BLESSBOARD': 24}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Form/POST contract changed (validation/CSRF/body) so redirect flows return 400 instead of 303
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-mf09-patient-dashboard.test.js` — anonymous dashboard redirects; empty and booked dashboards stay current-data-only
  - `tests/blessboard-growth-trial-registration.test.js` — Growth registration provisions automatically with one trialing subscription
  - `tests/blessboard-growth-trial-registration.test.js` — Network remains an enquiry
  - `tests/blessboard-instant-free-registration.test.js` — explicit false disables automatic provisioning and uses enquiry behavior
- **FILES:** 6 files (see machine list in triage notes; top examples above)

### RC08 — 25 failures (5.53%)

- **CATEGORY:** F. ROUTE/HTTP_CONTRACT
- **SIGNATURE:** public website/path expects 200, receives 301 Moved Permanently
- **FAILURE_COUNT:** 25
- **TEST_FILE_COUNT:** 12
- **PRODUCTS:** {'BLESSBOARD': 23, 'CROSS_PRODUCT': 1, 'PLATFORM': 1}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Canonical host/path redirects changed; tests hit non-canonical URLs without following redirects
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-apex-hq-website-lifecycle.test.js` — path public /c/:organizationKey resolves after publish or shows setup
  - `tests/blessboard-branch-mini-website-pages.test.js` — 10. Public users see only published content
  - `tests/blessboard-branch-mini-website-shell.test.js` — 1. Branch name is visible
  - `tests/blessboard-branch-mini-website-shell.test.js` — 2. Church name is visible
- **FILES:** 12 files (see machine list in triage notes; top examples above)

### RC23 — 14 failures (3.1%)

- **CATEGORY:** F. ROUTE/HTTP_CONTRACT
- **SIGNATURE:** HTTP status actual=303 expected=400
- **FAILURE_COUNT:** 14
- **TEST_FILE_COUNT:** 13
- **PRODUCTS:** {'ACTIVECLINIC': 4, 'BLESSBOARD': 5, 'PLATFORM': 5}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** LOW
- **LIKELY_CAUSE:** Route/status contract drift not covered by more specific RCs
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-clinic-onboarding.test.js` — duplicate email or phone is blocked and credentials are already cleared after auto-provision
  - `tests/activeclinic-platform-02.test.js` — registration edit from review uses GET navigation with signed draft cookie
  - `tests/activeclinic-platform-02.test.js` — registration confirm rejects invalid CSRF while GET edit stays available
  - `tests/activeclinic-public-root-routing.test.js` — 6. unknown and other product hosts keep existing fallback behavior
- **FILES:** 13 files (see machine list in triage notes; top examples above)

### RC02 — 12 failures (2.65%)

- **CATEGORY:** D. DATABASE_SCHEMA/IDENTITY
- **SIGNATURE:** user_role_assignments_revoked_consistency check violation on seed
- **FAILURE_COUNT:** 12
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'BLESSBOARD': 12}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Role-assignment test fixture writes revoked/active fields inconsistently with DB check constraint
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-branch-admin-shell.test.js` — authorized branch_admin receives 200 with shell markers and no fake metrics
  - `tests/blessboard-branch-admin-shell.test.js` — church_hq_admin receives 200 for own church branch
  - `tests/blessboard-branch-admin-shell.test.js` — platform_admin without support mode is denied branch portal
  - `tests/blessboard-branch-admin-shell.test.js` — wrong branch returns 403
- **FILES:**
  - `tests/blessboard-branch-admin-shell.test.js`

### RC03 — 11 failures (2.43%)

- **CATEGORY:** D. DATABASE_SCHEMA/IDENTITY
- **SIGNATURE:** user_role_assignments_active_scope_uidx unique violation
- **FAILURE_COUNT:** 11
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'CROSS_PRODUCT': 3, 'PLATFORM': 8}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Non-idempotent role seed / parallel leftover rows colliding on active scope unique index
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/v8-shared-form-studio-authz.test.js` — authorization context middleware attaches catalogue permissions
  - `tests/v8-shared-form-studio-authz.test.js` — HQ admin can open form studio create (not SH15 soft deny)
  - `tests/v8-shared-form-studio-authz.test.js` — HQ admin can create → preview → publish paths
  - `tests/v8-shared-form-studio-authz.test.js` — Form Studio invalid id stays controlled (not foundation 503 on studio path)
- **FILES:**
  - `tests/v8-shared-form-studio-authz.test.js`

### RC06 — 10 failures (2.21%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** Content Library / choose-existing label expectations vs current Image Library wording
- **FAILURE_COUNT:** 10
- **TEST_FILE_COUNT:** 9
- **PRODUCTS:** {'BLESSBOARD': 3, 'CROSS_PRODUCT': 4, 'ACTIVECLINIC': 1, 'PLATFORM': 2}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Known stale UI copy expectations in shared image/media editor tests
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-prompt7-stage3-website-settings-editor.test.js` — 1–6. Editor renders inherited, branch-record, overridden, hidden, locked, missing states
  - `tests/shared-website-editor-wave4b1.test.js` — image field dialog still exposes choose-existing media hook
  - `tests/v2-bb-home-leaders-image.test.js` — structured editor hydrates upload/library URLs from media.publicSrc (shared CDN DTO)
  - `tests/v2-bb-season-image-edit.test.js` — structured event form includes Upload / Content Library / Replace labels
- **FILES:**
  - `tests/blessboard-prompt7-stage3-website-settings-editor.test.js`
  - `tests/shared-website-editor-wave4b1.test.js`
  - `tests/v2-bb-home-leaders-image.test.js`
  - `tests/v2-bb-season-image-edit.test.js`
  - `tests/v2-shared-media-upload-parity.test.js`
  - `tests/v7-image-editor-coverage.test.js`
  - `tests/v7-inline-editor-coverage.test.js`
  - `tests/v7-unified-website-management.test.js`
  - `tests/website-ui-completion.test.js`

### RC14 — 7 failures (1.55%)

- **CATEGORY:** G. AUTH/RBAC
- **SIGNATURE:** HTTP 403 actual vs expected 400
- **FAILURE_COUNT:** 7
- **TEST_FILE_COUNT:** 6
- **PRODUCTS:** {'ACTIVECLINIC': 3, 'BLESSBOARD': 1, 'PLATFORM': 3}
- **SEVERITY:** P1
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Authorization denied where test expected success/redirect — could be RBAC regression or bad role seed (see RC02/RC03)
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-organization-settings-parity.test.js` — organization profile and edit enforce permissions, CSRF, and protected fields
  - `tests/activeclinic-roles-access-admin.test.js` — multi-role assign and single-role revoke recalculate access
  - `tests/activeclinic-roles-access-parity.test.js` — network admin assigns, edits expiry, and revokes with CSRF
  - `tests/blessboard-announcement-platform-admin-testing-policy.test.js` — HTTP testing app: platform admin publish + banner; CSRF required; production app still denies
- **FILES:**
  - `tests/activeclinic-organization-settings-parity.test.js`
  - `tests/activeclinic-roles-access-admin.test.js`
  - `tests/activeclinic-roles-access-parity.test.js`
  - `tests/blessboard-announcement-platform-admin-testing-policy.test.js`
  - `tests/shared-website-editor-wave4b1.test.js`
  - `tests/v7-branch-editor-canonical-actions.test.js`

### RC19 — 6 failures (1.33%)

- **CATEGORY:** I. APPLICATION_REGRESSION
- **SIGNATURE:** ActiveClinic booking↔patient linkage assertions failing
- **FAILURE_COUNT:** 6
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'ACTIVECLINIC': 6}
- **SEVERITY:** P1
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Patient linkage / cross-tenant link behavior disagrees with tests — needs product confirmation
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-booking-patient-linkage.test.js` — public booking with no match stays unlinked / new_patient_pending without patient_id
  - `tests/activeclinic-booking-patient-linkage.test.js` — exact phone candidate does not auto-link booking to patient
  - `tests/activeclinic-booking-patient-linkage.test.js` — create patient from booking reuses duplicate controls; nurse/cashier/pharmacy denied
  - `tests/activeclinic-booking-patient-linkage.test.js` — duplicate assessment is organization scoped
- **FILES:**
  - `tests/activeclinic-booking-patient-linkage.test.js`

### RC11 — 5 failures (1.11%)

- **CATEGORY:** B. TEST_ENVIRONMENT
- **SIGNATURE:** db foundation verify: unexpected_deployments present on local QA DB
- **FAILURE_COUNT:** 5
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'PLATFORM': 5}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Local/shared QA database not ephemeral-clean; verify-foundation rejects leftover deployments
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/db-bootstrap-foundation.test.js` — empty database bootstrap succeeds and creates schemas/tables/seeds
  - `tests/db-bootstrap-foundation.test.js` — identical bootstrap rerun is idempotent
  - `tests/db-bootstrap-foundation.test.js` — verify foundation passes and forbids public tenants/session
  - `tests/db-bootstrap-foundation.test.js` — verify rejects a deliberately unexpected blessboard product table
- **FILES:**
  - `tests/db-bootstrap-foundation.test.js`

### RC24 — 4 failures (0.88%)

- **CATEGORY:** D. DATABASE_SCHEMA/IDENTITY
- **SIGNATURE:** foundation schema/table catalogue deepEqual drift
- **FAILURE_COUNT:** 4
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'PLATFORM': 4}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Expected table/deployment allowlists stale vs current schemas
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/db-foundation.test.js` — clean migration applies schemas, ledger, identity, deployments, tenant catalogue
  - `tests/db-foundation.test.js` — product seeds exist exactly once after repeated migrations
  - `tests/db-foundation.test.js` — deployment seed rows: production/staging coexistence and job flags
  - `tests/db-foundation.test.js` — no platform.branches; getpro/ngo empty; blessboard allowlist only
- **FILES:**
  - `tests/db-foundation.test.js`

### RC15 — 3 failures (0.66%)

- **CATEGORY:** H. TENANT_ISOLATION
- **SIGNATURE:** tenant isolation / cross-tenant denial assertion failed
- **FAILURE_COUNT:** 3
- **TEST_FILE_COUNT:** 3
- **PRODUCTS:** {'ACTIVECLINIC': 1, 'BLESSBOARD': 1, 'PLATFORM': 1}
- **SEVERITY:** P1
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Isolation check failed — requires case-by-case review (may be redirect 301 masking 404)
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-booking-patient-linkage.test.js` — staff can link existing patient; cross-tenant patient denied
  - `tests/blessboard-branch-mini-websites.test.js` — 4. Unknown and foreign branch keys return 404
  - `tests/v7-getpro-testing-foundation.test.js` — production/testing hostname isolation remains intact
- **FILES:**
  - `tests/activeclinic-booking-patient-linkage.test.js`
  - `tests/blessboard-branch-mini-websites.test.js`
  - `tests/v7-getpro-testing-foundation.test.js`

### RC13 — 2 failures (0.44%)

- **CATEGORY:** J. PLAYWRIGHT/UI_ENVIRONMENT
- **SIGNATURE:** Playwright locator/action timeout
- **FAILURE_COUNT:** 2
- **TEST_FILE_COUNT:** 2
- **PRODUCTS:** {'ACTIVECLINIC': 1, 'BLESSBOARD': 1}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Missing selector due to upstream HTML/redirect mismatch or slow UI; not a browser install failure
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-acw09-registration.test.js` — keeps register, review, success, and Website Hub usable at 390px
  - `tests/v7-bb-mobile-editor-pointer.test.js` — five representative mobile fields open via pencil click
- **FILES:**
  - `tests/activeclinic-acw09-registration.test.js`
  - `tests/v7-bb-mobile-editor-pointer.test.js`

### RC12 — 2 failures (0.44%)

- **CATEGORY:** B. TEST_ENVIRONMENT
- **SIGNATURE:** PLATFORM_LINE_HOST_MISMATCH for testing hosts
- **FAILURE_COUNT:** 2
- **TEST_FILE_COUNT:** 2
- **PRODUCTS:** {'ACTIVECLINIC': 1, 'PLATFORM': 1}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Host→product line mapping in test env/config disagrees with expectations
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-unified-login.test.js` — Stage 4: unified deployment resolves products by host without leakage
  - `tests/v7-runtime-env-isolation.test.js` — resolves products by host and rejects production hosts on testing
- **FILES:**
  - `tests/activeclinic-unified-login.test.js`
  - `tests/v7-runtime-env-isolation.test.js`

### RC20 — 1 failures (0.22%)

- **CATEGORY:** G. AUTH/RBAC
- **SIGNATURE:** ActiveClinic finance RBAC / mutation result mismatch
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'ACTIVECLINIC': 1}
- **SEVERITY:** P1
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Finance mutation returned invalid_input instead of created — validation or permission path
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/activeclinic-finance-rbac.test.js` — finance supervisor refund/reverse/void/amend/reconcile allowed
- **FILES:**
  - `tests/activeclinic-finance-rbac.test.js`

### RC21 — 1 failures (0.22%)

- **CATEGORY:** G. AUTH/RBAC
- **SIGNATURE:** BlessBoard announcement platform-admin publish policy HTTP/capability mismatch
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'BLESSBOARD': 1}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Related to platform admin publish policy in testing vs production app; overlaps RC05
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-announcement-platform-admin-testing-policy.test.js` — capability publish follows allowPlatformAdminPublish only for platform_admin
- **FILES:**
  - `tests/blessboard-announcement-platform-admin-testing-policy.test.js`

### RC05 — 1 failures (0.22%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** platform_publish_denied vs role denial reason
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'BLESSBOARD': 1}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Known stale expectation: app returns role-based denial code; test expects platform_publish_denied
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-announcements.test.js` — evaluates platform publish policy without silent publish
- **FILES:**
  - `tests/blessboard-announcements.test.js`

### RC16 — 1 failures (0.22%)

- **CATEGORY:** H. TENANT_ISOLATION
- **SIGNATURE:** expected 404 for foreign resource, got redirect
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'BLESSBOARD': 1}
- **SEVERITY:** P1
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Foreign org/branch URL redirects instead of 404 — possible isolation/UX contract drift
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/blessboard-branch-mini-website-pages.test.js` — 11. Cross-organization access returns 404
- **FILES:**
  - `tests/blessboard-branch-mini-website-pages.test.js`

### RC04 — 1 failures (0.22%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** tests still expect mutable blessboard.user_roles (frozen V2.02)
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'PLATFORM': 1}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Stale migration/tooling test vs catalogue RBAC freeze
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/migration-tooling.test.js` — applies idempotently and resumes from checkpoints
- **FILES:**
  - `tests/migration-tooling.test.js`

### RC18 — 1 failures (0.22%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** publish entrypoint wiring expectation (publishFromLegacy / publishChurchWebsite)
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'BLESSBOARD': 1}
- **SEVERITY:** P2
- **V2_03_RELEASE_BLOCKER:** UNKNOWN
- **CONFIDENCE:** MEDIUM
- **LIKELY_CAUSE:** Stale architectural assertion about publish bridge wiring
- **APPLICATION_CHANGE_REQUIRED:** UNKNOWN
- **TEST_CHANGE_REQUIRED:** UNKNOWN
- **REPRESENTATIVE_TESTS:**
  - `tests/v7-blessboard-publish-engine-bridge.test.js` — every public BlessBoard publish entry point calls publishFromLegacy
- **FILES:**
  - `tests/v7-blessboard-publish-engine-bridge.test.js`

### RC07 — 1 failures (0.22%)

- **CATEGORY:** A. STALE_TEST_EXPECTATION
- **SIGNATURE:** registration/website E2E expects 200 but follows/receives 301
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'PLATFORM': 1}
- **SEVERITY:** TEST_DEBT_ONLY
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Known stale: permanent redirect to canonical tenant website path; test expects 200 body on pre-redirect URL
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/v7-local-registration-to-website-e2e.test.js` — walks ActiveClinic and BlessBoard from registration through restore
- **FILES:**
  - `tests/v7-local-registration-to-website-e2e.test.js`

### RC17 — 1 failures (0.22%)

- **CATEGORY:** C. MISSING_TEST_PREREQUISITE
- **SIGNATURE:** demo image unavailable on CDN in test env
- **FAILURE_COUNT:** 1
- **TEST_FILE_COUNT:** 1
- **PRODUCTS:** {'PLATFORM': 1}
- **SEVERITY:** P3
- **V2_03_RELEASE_BLOCKER:** NO
- **CONFIDENCE:** HIGH
- **LIKELY_CAUSE:** Missing CDN/media prerequisite for website draft/live integrity tests
- **APPLICATION_CHANGE_REQUIRED:** NO
- **TEST_CHANGE_REQUIRED:** YES
- **REPRESENTATIVE_TESTS:**
  - `tests/v7-website-draft-live-integrity.test.js` — 2-5 text and image ✓ write draft only; authorized preview reads draft
- **FILES:**
  - `tests/v7-website-draft-live-integrity.test.js`

---

## 3. Failure multiplication

UNIQUE_ROOT_CAUSES=27

TOP_10_ROOT_CAUSES_BY_FAILURE_COUNT:

| Rank | ID | Failures | % of 452 | Severity | Signature |
|--:|--|--:|--:|--|--|
| 1 | RC01 | 114 | 25.22% | P2 | platform_church_registration_applications.branch_name NOT NULL / required (seed + API) |
| 2 | RC10 | 78 | 17.26% | TEST_DEBT_ONLY | stale CSS cache-bust fingerprint regex |
| 3 | RC26 | 41 | 9.07% | P3 | value/deep equality assertion failure |
| 4 | RC99 | 31 | 6.86% | P3 | unclassified |
| 5 | RC22 | 28 | 6.19% | TEST_DEBT_ONLY | HTML/JS shell regex contract drift (non-fingerprint) |
| 6 | RC25 | 26 | 5.75% | P3 | boolean/assert.ok failure without specific classifier |
| 7 | RC09 | 25 | 5.53% | P2 | expected 303 redirect, got 400 |
| 8 | RC08 | 25 | 5.53% | P3 | public website/path expects 200, receives 301 Moved Permanently |
| 9 | RC23 | 14 | 3.1% | P3 | HTTP status actual=303 expected=400 |
| 10 | RC02 | 12 | 2.65% | P2 | user_role_assignments_revoked_consistency check violation on seed |

Interpretation examples:

- **RC01:** one missing `branch_name` in registration seed/helpers → **114** BlessBoard manifestations (alerts, registration ops, invitations, risk review, testing maintenance, etc.).
- **RC10:** CSS `?v=N` pin drift → **78** manifestations across 57 files (not 78 asset bugs).
- **RC02/RC03:** two `user_role_assignments` fixture/index issues → **23** authz-setup failures that can also cascade into 403s.

---

## 4. Known stale debt (exact attribution)

| Known item | Root cause | Failures attributable | Notes |
|--|--|--:|--|
| platform_publish_denied vs role | RC05 | **1** | `tests/blessboard-announcements.test.js` — expected `platform_publish_denied`, actual `role` |
| Content Library vs Image Library | RC06 | **10** | Label/regex expectations (`Choose from Content Library`, choose-existing, related editor source probes) |
| registration E2E 301 | RC07 | **1** | `tests/v7-local-registration-to-website-e2e.test.js` — actual 301 expected 200 |

**These three explain 12 / 452 failures only.** They do **not** explain the remainder.

Related but **not** counted as the known registration-E2E stale item:

- **RC08:** 25 additional failures with actual **301** vs expected **200** on public website/path flows (broader redirect-contract drift).

---

## 5. Product split

```text
PLATFORM_FAILURES=62
BB_FAILURES=320
AC_FAILURES=51
CROSS_PRODUCT_FAILURES=19
INFRA_FAILURES=0
```

Unique root causes per product (a root cause may appear in multiple products):

| Product | Failures | Distinct root causes touching product |
|--|--:|--:|
| PLATFORM | 62 | 17 |
| BLESSBOARD | 320 | 18 |
| ACTIVECLINIC | 51 | 14 |
| CROSS_PRODUCT | 19 | 6 |
| TEST_INFRASTRUCTURE | 0 | 0 |

BlessBoard dominates because RC01 (`branch_name`) and many CSS/public-shell stale regexes concentrate there.

---

## 6. Release-risk classification

### P0

**None assigned.** No failure cluster had concrete, high-confidence evidence of a production-safety defect *independent of seed/env/stale expectations* from this log alone.

### P1 root causes (18 failures total) — need targeted verification

| ID | Failures | Why P1 | Blocker? |
|--|--:|--|--|
| RC14 | 7 | HTTP **403** where tests expected allow/redirect/validation — authz surface (AC roles, org settings, media upload, announcement publish, branch editor) | UNKNOWN |
| RC19 | 6 | AC booking↔patient linkage assertions (includes cross-tenant denial path in same file) | UNKNOWN |
| RC15 | 3 | Explicit tenant isolation / cross-tenant denial assertions | UNKNOWN |
| RC16 | 1 | Foreign org/branch expected **404**, got redirect — isolation contract drift possible | UNKNOWN |
| RC20 | 1 | AC finance supervisor mutation returned `invalid_input` instead of `created` | UNKNOWN |

These are **not** auto-elevated to release blockers: several 403s may cascade from RC02/RC03 role-seed failures; isolation cases may be redirect-contract (301) rather than data leakage. They require focused non-coverage repro before calling a V2.03 ship stop.

### P2

Dominated by **RC01** (114) and redirect/validation contract **RC09** (25), plus role-assignment seed issues RC02/RC03, host mismatch RC12, announcement policy RC21, publish bridge RC18.

### P3 / TEST_DEBT_ONLY

Large volume: CSS fingerprints (RC10), HTML regex drift (RC22), broader 301→200 (RC08), foundation verify env (RC11), residual value/bool buckets (RC25/RC26/RC99).

---

## 7. V2.02 fix safety (Announcements / Sermons / Universal Image Editor)

Cross-check against known targeted green results:

| Area | Targeted green | Failures in *named* test files in this run | Contradiction? |
|--|--|--|--|
| Announcements | 5/5 | **3** in `blessboard-announcement*.test.js` / `blessboard-announcements.test.js` (RC05, RC14, RC21) | **SOFT CONTRADICTION** — full monolithic suite shows announcement policy/HTTP failures not seen in the targeted 5/5 pack; likely suite/env/policy-matrix differences, not proof the V2.02 announcement fix regressed |
| Sermons | 13/13 | **1** in `church-public-events-sermons-visual.test.js` | **NO functional contradiction** — failure is RC10/nav CSS regex (`church-nav__active` / events), not sermon CRUD/publish logic |
| Universal Image Editor | A 17/17, B 8/8, D 7/7 | **5** in image/media-named files | **NO functional contradiction to A/B/D** — 4× RC06 Content Library wording + 1× RC10 CSS fingerprint; matches known **label stale debt**, not editor runtime regressions from the green packs |

Keyword-wide scans that touch the words announcement/sermon/image in unrelated suites were ignored for contradiction analysis; file-based attribution above is authoritative.

---

## 8. Coverage validity

```text
COVERAGE_DATA_TECHNICALLY_VALID=YES
COVERAGE_REPRESENTATIVE_OF_GREEN_SUITE=NO
```

| Question | Answer |
|--|--|
| Are `coverage-final.json` / summary / lcov structurally complete? | **YES** — harness wrote full reports; meta `reportsOk=true`; 924 V8 tmp files present |
| Does fail≠pass invalidate % math? | **NO** — c8 records execution; failed tests still execute code before asserting |
| Is 65.71% “green suite coverage”? | **NO** — 452 failing tests mean paths may include error/fallback branches and miss success-path assertions; do not market 65.71% as coverage of a fully green suite |
| Discard 65.71%? | **NO** — keep as freeze execution coverage from this completed run |

---

## 9. Prioritized remediation (root causes, not 452 tests)

| ORDER | ROOT_CAUSE | FAILURES_ELIMINATED | FILES/SUITES_AFFECTED | APP_CHANGE | TEST_CHANGE | RISK | SCOPE |
|--:|--|--:|--|--|--|--|--|
| 1 | RC01 `branch_name` seed/schema contract | ~114 | 20 BB registration/ops suites | UNKNOWN | YES | Low if tests/seeds updated to satisfy NOT NULL; Medium if product no longer wants branch_name | MEDIUM |
| 2 | RC10 CSS `?v=` fingerprints | ~78 | 57 files | NO | YES | Low — loosen regex or read version from asset helper | SMALL |
| 3 | RC02+RC03 `user_role_assignments` seed/index | ~23 | branch-admin-shell + form-studio authz | NO/UNKNOWN | YES | Medium — may clear some RC14 403s | MEDIUM |
| 4 | RC09 expected 303 got 400 | ~25 | 6 files (BB registration + AC dashboard) | UNKNOWN | UNKNOWN | Medium — verify CSRF/body/validation vs intentional 400 | MEDIUM |
| 5 | RC08+RC07 301 vs 200 redirects | ~26 | website/public + registration E2E | NO | YES | Low — follow redirects or expect 301 | SMALL |
| 6 | RC06 Content vs Image Library labels | 10 | shared image/editor tests | NO | YES | Low — known stale copy | SMALL |
| 7 | RC05 platform_publish_denied vs role | 1 | announcements | NO | YES | Low — known stale | SMALL |
| 8 | P1 cluster RC14/15/16/19/20 | 18 | AC roles/billing/booking + BB isolation/publish | UNKNOWN | UNKNOWN | **Higher** — targeted manual/QA repro before app changes | MEDIUM |
| 9 | RC11/RC12/RC17 env prerequisites | ~8 | foundation + host mapping + CDN | NO | YES | Low–Medium env hygiene | SMALL |
| 10 | Residual RC22/RC25/RC26/RC99 | ~126 | mixed | UNKNOWN | YES | Triage in batches after top multipliers cleared (many will disappear or become obvious) | LARGE |

**Do not** chase 452 tests individually until RC01/RC10/RC02/RC03 are cleared.

---

## 10. Method notes

- Parser: full TAP walk of indented `not ok` + YAML diagnostics; suite rollups excluded from the 452.
- Product attribution: primarily test file path (`activeclinic-*`, `blessboard-*`/`church-*`, `v8-`/`v10-`/`v7-shared`, etc.), with cross-product overrides for shared BB/AC contracts.
- “Local PostgreSQL unavailable: …” prefix on many errors is a **test helper wrap** around real PG constraint errors (not evidence the DB server was down).
- Residual buckets **RC25/RC26/RC99** remain intentionally coarse after multipliers were extracted; they are mixed value/bool/HTML residuals, not claimed as single defects.

### Machine-readable extracts (local, not committed)

- `/tmp/v202-failure-triage/leaf_final.json` — all 452 enriched failures
- `/tmp/v202-failure-triage/root_causes_merged.json` — root-cause rollup

---

## FINAL VERDICT

```text
V2_03_FULL_COVERAGE_FAILURES_TRIAGED
```

