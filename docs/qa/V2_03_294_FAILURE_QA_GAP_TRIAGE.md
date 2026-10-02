# V2.03 — 294 Failure + QA Gap Triage

**FINAL: `V2_03_294_FAILURES_QA_GAPS_TRIAGED`**

## Identity

| Field | Value |
|---|---|
| Branch | `V10` |
| Tip | `32e83bd5` |
| Source log | `/tmp/v203-canonical-phase-b-final/canonical-batched.log` |
| Source QA map | `/tmp/v203-phase-c/qa-id-results-final.json` |
| Triage artifacts | `/tmp/v203-triage/` |
| Suite re-run | **NO** |
| Coverage | **FROZEN** |
| Fixes implemented | **NO** |
| `PRODUCTION` | **UNTOUCHED** |

## Executive census

```
CANONICAL_FAILURES=294
FAILED_TEST_FILES=155
UNIQUE_FAILURE_SIGNATURES=147
UNIQUE_ROOT_CAUSES=31

QA_TOTAL=98
QA_PASSING=66
QA_NOT_PASSING=32

QA_FAILURES_INSIDE_294=32
QA_FAILURES_OUTSIDE_294=0
QA_NOT_EXECUTED=0
QA_SKIPPED=0

P0=0
P1=5
P2=118
P3=99
TEST_DEBT_ONLY=72

PROVEN_APPLICATION_DEFECTS=0
SUSPECTED_APPLICATION_DEFECTS=4

COVERAGE_CAMPAIGN=FROZEN
PRODUCTION=UNTOUCHED
```

### FAILURES_BY_PRODUCT

```
PLATFORM=21
BB=197
AC=12
CROSS_PRODUCT=64
INFRA=0
```

### FAILURES_BY_CLASS

```
FIXTURE_DRIFT=17
STALE_TEST=73
APPLICATION_DEFECT=0
AUTH_RBAC=8
TENANT_ISOLATION=0
DB_STATE=10
HTTP_CONTRACT=71
VALIDATION=7
UI_CONTRACT=8
TEST_INFRA=4
ENVIRONMENT=5
UNKNOWN=91
```

---

## 1. Root-cause catalogue (31)

Leaf failures only (suite-level \`N subtests failed\` wrappers excluded). Coarse Phase B classifier had 10 buckets; this triage subdivides \`RC_ASSERT_VALUE\` / \`RC_OTHER\` / mis-tagged tenant asserts.

| RC_ID | FAILURE_COUNT | PRODUCT | CLASS | SEV | SIGNATURE | LIKELY_CAUSE | QA_SCENARIOS_AFFECTED |
|--|--:|--|--|--|--|--|--|
| `RC10_CSS_FINGERPRINT` | 62 | BB | STALE_TEST | TEST_DEBT_ONLY | CSS/asset regex fingerprint | ui | BB-MED-01, BB-REG-05, SH-AUTH-01, SH-AUTH-04, SH-DFT-01, SH-MED-01, +2 |
| `RC_PUBLIC_NAV_HTML` | 7 | BB | UI_CONTRACT | P3 | public/branch HTML contract | public html | BB-BR-03, BB-PAGE-EVT, BB-PAGE-GIV, BB-PAGE-MIN, BB-PAGE-SER, BB-PUB-HOME, +1 |
| `RC_HTTP_301_REDIRECT` | 32 | BB | HTTP_CONTRACT | P2 | unexpected 301 redirect | canonical URL / followRedirect contract | BB-BR-03, BB-V203-E2E, SH-DFT-01, SH-WE-01 |
| `RC06_LIBRARY_LABEL` | 5 | CROSS_PRODUCT | STALE_TEST | TEST_DEBT_ONLY | Content Library vs Image Library wording | copy drift | BB-MED-01, BB-PAGE-HOME, BB-PAGE-LEAD, SH-MED-01, SH-MED-02 |
| `RC_REG_PHONE_FIXTURE` | 7 | BB | FIXTURE_DRIFT | P2 | registration phone fixture | ZM phone | BB-REG-01, BB-REG-04, SH-ID-01, SH-REG-02 |
| `RC_REG_PROVISION_PATH` | 6 | BB | VALIDATION | P2 | provision vs enquiry path | reg product path | BB-REG-01, BB-REG-04, BB-REG-05, SH-REG-02 |
| `RC_AC_ROLES_WRITE_403` | 2 | AC | AUTH_RBAC | P1 | AC roles write expected 303 got 403 | authorized role mutation denied — suspected RBAC/CSRF/seed | AC-RBAC-01, AC-STAFF-01 |
| `RC_ANN_PLATFORM_PUBLISH_403` | 1 | BB | AUTH_RBAC | P1 | platform_admin announce publish expected 200 got 403 | policy/env allowPlatformAdminPublish | BB-ANN-03, PL-ADM-01 |
| `RC_REG_CONTRACT` | 7 | BB | HTTP_CONTRACT | P2 | registration contract | reg | BB-REG-01, BB-REG-04, SH-REG-02 |
| `RC_HOST_PRODUCT_ROUTING` | 3 | CROSS_PRODUCT | ENVIRONMENT | P2 | host→product routing / testing foundation | env/host contracts block shared auth scenarios | SH-HOST-01, SH-HOST-02, SH-VER-01 |
| `RC12_PLATFORM_LINE_HOST` | 2 | AC | ENVIRONMENT | P2 | PLATFORM_LINE_HOST_MISMATCH | env host registry | SH-AUTH-05, SH-HOST-01, SH-HOST-02 |
| `RC_ANN_PUBLISH_POLICY` | 2 | BB | AUTH_RBAC | P2 | announcement publish policy assert | publish policy | BB-ANN-01, BB-ANN-03, PL-ADM-01 |
| `RC_HTTP_STATUS_MISMATCH` | 20 | BB | HTTP_CONTRACT | P2 | HTTP status mismatch | http contract | BB-REG-01, SH-REG-02 |
| `RC_DB_BOOTSTRAP_SEED` | 10 | PLATFORM | DB_STATE | P2 | DB bootstrap/migration/seed | db foundation | PL-DB-01, PL-DB-02 |
| `RC_MEDIA_UPLOAD_403` | 1 | CROSS_PRODUCT | AUTH_RBAC | P1 | media upload expected 200 got 403 | authorized media write denied | — |
| `RC_HTTP_AUTHZ_STATUS` | 1 | CROSS_PRODUCT | AUTH_RBAC | P1 | HTTP authz status mismatch | authz status | — |
| `RC_OTHER` | 34 | BB | UNKNOWN | P3 | other | unknown | — |
| `RC_REG_APPROVAL_FLOW` | 5 | BB | HTTP_CONTRACT | P2 | approval/invitation flow | reg ops | BB-REG-05 |
| `RC_ASSERT_VALUE` | 31 | BB | UNKNOWN | P3 | Expected values to be strictly equal: + actual - expected + undefined  | unknown assert | — |
| `RC_PLAT_ADMIN_DIRECTORY` | 1 | BB | AUTH_RBAC | P2 | platform admin directory | admin projection | PL-ADM-01 |
| `RC_EMPTY_ERROR` | 26 | BB | UNKNOWN | P3 | empty/opaque assertion payload | needs leaf re-open | — |
| `RC_RELEASE_NOTES_CATALOGUE` | 1 | CROSS_PRODUCT | STALE_TEST | TEST_DEBT_ONLY | release notes catalogue | docs catalogue | SH-VER-01 |
| `RC_FIXTURE_BRANCH_NOT_FOUND` | 10 | BB | FIXTURE_DRIFT | P2 | Local PG branch_not_found — fixture/setup cascade | branch fixture fails → downstream route/auth asserts never reached | — |
| `RC_MEDIA_CDN_DTO` | 4 | CROSS_PRODUCT | HTTP_CONTRACT | P2 | media/CDN DTO contract | media | — |
| `RC_TIMEOUT` | 4 | BB | TEST_INFRA | P2 | timeout | infra | — |
| `RC_TENANT_SESSION_ROUTES` | 3 | BB | HTTP_CONTRACT | P2 | tenant session website route projection | session route links | — |
| `RC_REG_IDEMPOTENCY` | 1 | BB | VALIDATION | P2 | registration retry idempotency | reg | — |
| `RC_MEDIA_CROSS_TENANT_STATUS` | 1 | CROSS_PRODUCT | STALE_TEST | P2 | cross-tenant media expected deny shape mismatch | test expects 200 on path that returns 403 — contract drift | — |
| `RC22_REGEX_HTML_CONTRACT` | 3 | CROSS_PRODUCT | STALE_TEST | TEST_DEBT_ONLY | HTML/JS regex contract drift | stale html | — |
| `RC_AC_ORG_SETTINGS_STATUS` | 1 | AC | STALE_TEST | P3 | org settings expected 303 got 403 | likely stale success expectation vs tightened authz (see 1120e52a) | — |
| `RC_WE_STITCH_CHROME` | 1 | CROSS_PRODUCT | UI_CONTRACT | TEST_DEBT_ONLY | website editor Stitch chrome | ui chrome | — |

---

## 2. All 32 non-passing QA scenarios

Every scenario was **EXECUTED=YES** in Phase C (refine \`BATCH_SIZE=1\`) and **RESULT=FAIL**. All 32 have ≥1 cited file inside the canonical 294 failed-file set.

| QA_ID | PRODUCT | FUNCTION | TEST_FILE (failing) | EXECUTED | RESULT | FAILURE_SIGNATURE | RELATED_RC_ID |
|--|--|--|--|--|--|--|--|
| SH-AUTH-01 | SHARED | auth/login | `blessboard-auth-http.test.js` | YES | FAIL | stale CSS ?v= fingerprint | `RC10_CSS_FINGERPRINT` |
| SH-AUTH-04 | SHARED | auth/login | `blessboard-auth-http.test.js` | YES | FAIL | stale CSS ?v= fingerprint | `RC10_CSS_FINGERPRINT` |
| SH-AUTH-05 | SHARED | auth/login | `activeclinic-unified-login.test.js, v7-runtime-env-isolation.test.js` | YES | FAIL | PLATFORM_LINE_HOST_MISMATCH | `RC12_PLATFORM_LINE_HOST` |
| SH-ID-01 | SHARED | phone/email identity | `blessboard-registration-phone.test.js` | YES | FAIL | registration phone fixture | `RC_REG_PHONE_FIXTURE` |
| SH-REG-02 | SHARED | registration | `blessboard-instant-free-registration.test.js` | YES | FAIL | HTTP status mismatch | `RC_HTTP_STATUS_MISMATCH, RC_REG_CONTRACT, RC_REG_PHONE_FIXTURE, RC_REG_PROVISION_PATH` |
| SH-MED-01 | SHARED | media upload | `v2-shared-media-upload-parity.test.js` | YES | FAIL | Content Library vs Image Library wording | `RC06_LIBRARY_LABEL, RC10_CSS_FINGERPRINT` |
| SH-MED-02 | SHARED | media library | `v2-shared-media-upload-parity.test.js` | YES | FAIL | Content Library vs Image Library wording | `RC06_LIBRARY_LABEL, RC10_CSS_FINGERPRINT` |
| SH-DFT-01 | SHARED | draft/reload | `v7-website-draft-live-integrity.test.js, v2-01-unpublished-changes-panel.test.js` | YES | FAIL | unexpected 301 redirect | `RC10_CSS_FINGERPRINT, RC_HTTP_301_REDIRECT, RC_PUBLIC_NAV_HTML` |
| SH-WE-01 | SHARED | website editing | `shared-website-editor-wave1.test.js, shared-website-editor-wave2.test.js` | YES | FAIL | stale CSS ?v= fingerprint | `RC10_CSS_FINGERPRINT, RC_HTTP_301_REDIRECT` |
| SH-VER-01 | SHARED | version/about | `v2-01-release-notes-center.test.js, v7-getpro-testing-foundation.test.js` | YES | FAIL | release notes catalogue | `RC_HOST_PRODUCT_ROUTING, RC_RELEASE_NOTES_CATALOGUE` |
| SH-HOST-01 | SHARED | domain/product routing | `v7-runtime-env-isolation.test.js, activeclinic-unified-login.test.js, v7-domain-resolved-platform.test.js` | YES | FAIL | PLATFORM_LINE_HOST_MISMATCH | `RC12_PLATFORM_LINE_HOST, RC_HOST_PRODUCT_ROUTING` |
| SH-HOST-02 | SHARED | domain/product routing | `v7-runtime-env-isolation.test.js, v7-getpro-testing-foundation.test.js` | YES | FAIL | PLATFORM_LINE_HOST_MISMATCH | `RC12_PLATFORM_LINE_HOST, RC_HOST_PRODUCT_ROUTING` |
| BB-REG-01 | BLESSBOARD | church registration | `blessboard-instant-free-registration.test.js` | YES | FAIL | HTTP status mismatch | `RC_HTTP_STATUS_MISMATCH, RC_REG_CONTRACT, RC_REG_PHONE_FIXTURE, RC_REG_PROVISION_PATH` |
| BB-REG-04 | BLESSBOARD | church registration | `blessboard-registration-risk-review.test.js, blessboard-registration-operator-approval.test.js` | YES | FAIL | registration phone fixture | `RC_REG_CONTRACT, RC_REG_PHONE_FIXTURE, RC_REG_PROVISION_PATH` |
| BB-REG-05 | BLESSBOARD | church registration | `blessboard-registration-approval-flow-ui.test.js, blessboard-registration-approval-invitation.test.js` | YES | FAIL | stale CSS ?v= fingerprint | `RC10_CSS_FINGERPRINT, RC_REG_APPROVAL_FLOW, RC_REG_PROVISION_PATH` |
| BB-BR-03 | BLESSBOARD | HQ/branch behavior | `blessboard-branch-mini-websites.test.js, blessboard-branch-mini-website-shell.test.js` | YES | FAIL | unexpected 301 redirect | `RC_HTTP_301_REDIRECT, RC_PUBLIC_NAV_HTML` |
| BB-PUB-HOME | BLESSBOARD | website pages | `church-public-home-ministries-regression.test.js` | YES | FAIL | public/branch HTML contract | `RC_PUBLIC_NAV_HTML` |
| BB-PAGE-HOME | BLESSBOARD | Home | `v2-bb-home-leaders-image.test.js` | YES | FAIL | Content Library vs Image Library wording | `RC06_LIBRARY_LABEL` |
| BB-PAGE-LEAD | BLESSBOARD | Leadership | `v2-bb-home-leaders-image.test.js` | YES | FAIL | Content Library vs Image Library wording | `RC06_LIBRARY_LABEL` |
| BB-PAGE-MIN | BLESSBOARD | Ministries | `church-public-home-ministries-regression.test.js` | YES | FAIL | public/branch HTML contract | `RC_PUBLIC_NAV_HTML` |
| BB-PAGE-EVT | BLESSBOARD | Events | `church-public-events-sermons-visual.test.js` | YES | FAIL | public/branch HTML contract | `RC_PUBLIC_NAV_HTML` |
| BB-PAGE-SER | BLESSBOARD | Sermons | `church-public-events-sermons-visual.test.js` | YES | FAIL | public/branch HTML contract | `RC_PUBLIC_NAV_HTML` |
| BB-ANN-01 | BLESSBOARD | Announcements | `blessboard-announcements.test.js` | YES | FAIL | announcement publish policy assert | `RC_ANN_PUBLISH_POLICY` |
| BB-ANN-03 | BLESSBOARD | Announcements | `blessboard-announcements.test.js, blessboard-announcement-platform-admin-testing-policy.test.js` | YES | FAIL | announcement publish policy assert | `RC_ANN_PLATFORM_PUBLISH_403, RC_ANN_PUBLISH_POLICY` |
| BB-PAGE-GIV | BLESSBOARD | Giving | `church-public-giving-contact-visual.test.js` | YES | FAIL | public/branch HTML contract | `RC_PUBLIC_NAV_HTML` |
| BB-MED-01 | BLESSBOARD | media | `v2-shared-media-upload-parity.test.js` | YES | FAIL | Content Library vs Image Library wording | `RC06_LIBRARY_LABEL, RC10_CSS_FINGERPRINT` |
| BB-V203-E2E | BLESSBOARD | V2.03 QA | `v7-local-registration-to-website-e2e.test.js` | YES | FAIL | unexpected 301 redirect | `RC_HTTP_301_REDIRECT` |
| AC-STAFF-01 | ACTIVECLINIC | staff/invites | `activeclinic-roles-access-admin.test.js, activeclinic-roles-access-parity.test.js` | YES | FAIL | AC roles write expected 303 got 403 | `RC_AC_ROLES_WRITE_403` |
| AC-RBAC-01 | ACTIVECLINIC | access/RBAC | `activeclinic-roles-access-admin.test.js, activeclinic-roles-access-parity.test.js` | YES | FAIL | AC roles write expected 303 got 403 | `RC_AC_ROLES_WRITE_403` |
| PL-DB-01 | PLATFORM | migrations/bootstrap | `db-bootstrap-foundation.test.js, db-foundation.test.js` | YES | FAIL | DB bootstrap/migration/seed | `RC_DB_BOOTSTRAP_SEED` |
| PL-DB-02 | PLATFORM | migrations/bootstrap | `migration-tooling.test.js` | YES | FAIL | DB bootstrap/migration/seed | `RC_DB_BOOTSTRAP_SEED` |
| PL-ADM-01 | PLATFORM | platform admin | `blessboard-announcement-platform-admin-testing-policy.test.js, blessboard-platform-admin-directory.test.js` | YES | FAIL | announcement publish policy assert | `RC_ANN_PLATFORM_PUBLISH_403, RC_ANN_PUBLISH_POLICY, RC_PLAT_ADMIN_DIRECTORY` |

### Overlap

```
QA_NOT_PASSING=32
QA_FAILURES_INSIDE_294=32
QA_FAILURES_OUTSIDE_294=0
QA_NOT_EXECUTED=0
QA_SKIPPED=0
```

Automation existence ≠ pass. Phase C inventory \`AUTOMATED=YES\` remains distinct from \`PASSED\`.

---

## 3. TOP_15_ROOT_CAUSES

Ranked by QA scenarios blocked, canonical failure volume, and security/business risk (P1 boosted).

| # | RC_ID | CANONICAL_FAILURES | QA_SCENARIOS_BLOCKED | PRODUCT | CLASSIFICATION | RISK | DEPENDENCIES |
|--|--|--:|--:|--|--|--|--|
| 1 | `RC10_CSS_FINGERPRINT` | 62 | 8 | BB | STALE_TEST | TEST_DEBT_ONLY | — |
| 2 | `RC_AC_ROLES_WRITE_403` | 2 | 2 | AC | AUTH_RBAC | P1 | RC_FIXTURE_BRANCH_NOT_FOUND |
| 3 | `RC_ANN_PLATFORM_PUBLISH_403` | 1 | 2 | BB | AUTH_RBAC | P1 | RC_HOST_PRODUCT_ROUTING |
| 4 | `RC_PUBLIC_NAV_HTML` | 7 | 7 | BB | UI_CONTRACT | P3 | RC_HTTP_301_REDIRECT |
| 5 | `RC_MEDIA_UPLOAD_403` | 1 | 0 | CROSS_PRODUCT | AUTH_RBAC | P1 | RC_HOST_PRODUCT_ROUTING |
| 6 | `RC_HTTP_AUTHZ_STATUS` | 1 | 0 | CROSS_PRODUCT | AUTH_RBAC | P1 | RC_FIXTURE_BRANCH_NOT_FOUND |
| 7 | `RC06_LIBRARY_LABEL` | 5 | 5 | CROSS_PRODUCT | STALE_TEST | TEST_DEBT_ONLY | — |
| 8 | `RC_HTTP_301_REDIRECT` | 32 | 4 | BB | HTTP_CONTRACT | P2 | — |
| 9 | `RC_REG_PHONE_FIXTURE` | 7 | 4 | BB | FIXTURE_DRIFT | P2 | — |
| 10 | `RC_REG_PROVISION_PATH` | 6 | 4 | BB | VALIDATION | P2 | RC_REG_PHONE_FIXTURE |
| 11 | `RC_REG_CONTRACT` | 7 | 3 | BB | HTTP_CONTRACT | P2 | RC_REG_PHONE_FIXTURE |
| 12 | `RC_HOST_PRODUCT_ROUTING` | 3 | 3 | CROSS_PRODUCT | ENVIRONMENT | P2 | — |
| 13 | `RC12_PLATFORM_LINE_HOST` | 2 | 3 | AC | ENVIRONMENT | P2 | RC_HOST_PRODUCT_ROUTING |
| 14 | `RC_ANN_PUBLISH_POLICY` | 2 | 3 | BB | AUTH_RBAC | P2 | — |
| 15 | `RC_HTTP_STATUS_MISMATCH` | 20 | 2 | BB | HTTP_CONTRACT | P2 | RC_FIXTURE_BRANCH_NOT_FOUND, RC_REG_PHONE_FIXTURE |

---

## 4. Dependency analysis

**Prerequisite → symptom chains observed in the log:**

1. **\`RC_FIXTURE_BRANCH_NOT_FOUND\`** (\`Local PostgreSQL unavailable: branch_not_found\`)  
   → tenant-context website routes, branch-admin reconciliation, and several HTML asserts never reach the intended authorization/content branch.  
   **Fix before:** \`RC_TENANT_SESSION_ROUTES\`, much of \`RC_ASSERT_VALUE\`/\`RC_OTHER\` on branch-admin files, \`RC_HTTP_AUTHZ_STATUS\` (branch editor).

2. **\`RC_REG_PHONE_FIXTURE\`** (ZM \`phone_national\` / phone asserts)  
   → registration provision/approval/idempotency leaves and member-journey phone paths fail early.  
   **Fix before:** \`RC_REG_PROVISION_PATH\`, \`RC_REG_APPROVAL_FLOW\`, \`RC_REG_CONTRACT\`, \`RC_E2E_JOURNEY_CASCADE\`.

3. **\`RC_HOST_PRODUCT_ROUTING\` / \`RC12_PLATFORM_LINE_HOST\`**  
   → shared auth, foundation, and host-isolation scenarios fail; downstream product workflows on wrong host are invalid.  
   **Fix before:** shared auth QA (\`SH-AUTH-05\`, \`SH-HOST-*\`), media upload authz checks that assume correct product host.

4. **\`RC_HTTP_301_REDIRECT\`** (branch mini-site / public URL canonicalization)  
   → public nav HTML and E2E public GETs see redirect bodies instead of 200 HTML.  
   **Fix before:** \`RC_PUBLIC_NAV_HTML\`, parts of \`RC_E2E_JOURNEY_CASCADE\`.

5. **CSS / library / Stitch chrome (\`RC10\`, \`RC06\`, \`RC_WE_*\`)**  
   → **no business-behavior dependency**; schedule after functional/security waves.

---

## 5. P0/P1 reassessment (current 294 only)

Previous overnight P0/P1 labels are **not** reused.

| Severity | Count | Notes |
|--|--:|--|
| **P0** | **0** | No leaf shows unauthorized success / cross-tenant data disclosure / destructive write succeeding without authz. |
| **P1** | **5** | Authorized-actor **denials** (403/forbidden) where tests expect success — availability/authz regression candidates. |
| **P2** | **118** | Fixtures, HTTP contracts, reg paths, DB bootstrap, env host routing, timeouts. |
| **P3** | **99** | Opaque/unknown asserts, minor UI HTML. |
| **TEST_DEBT_ONLY** | **72** | CSS \`?v=\` pins, library wording, HTML regex chrome. |

### P1 evidence (concrete)

| Leaf | Evidence |
|--|--|
| \`activeclinic-roles-access-admin/parity\` | \`strictEqual\`: **actual 403, expected 303** on multi-role assign/revoke |
| \`shared-website-editor-wave4b1\` media upload | **actual 403, expected 200** on authorized upload |
| \`blessboard-announcement-platform-admin-testing-policy\` | **actual 403, expected 200** platform_admin publish |
| \`v7-branch-editor-canonical-actions\` | JSON \`{{"ok":false,"code":"forbidden"}}\` — **403 ≠ 200** on branch history/styles/seo |

**Not P1:** \`RC_MEDIA_CROSS_TENANT_STATUS\` — test titled “cross-tenant … rejected” but asserts expected **200**; treat as **STALE_TEST** / contract drift.  
**Not tenant-escape P1:** many prior “tenant” tags were \`branch_not_found\` cascades or CSS paths containing the word tenant.

---

## 6. Application defects (no fixes this prompt)

### PROVEN_APPLICATION_DEFECTS = 0

No defect with both (a) unauthorized/incorrect persistence proven and (b) expected product contract documented beyond the failing test’s own expectation.

### SUSPECTED_APPLICATION_DEFECTS = 4

| RC_ID | CURRENT_CONTRACT | EXPECTED | ACTUAL | REPRODUCIBLE |
|--|--|--|--|--|
| `RC_AC_ROLES_WRITE_403` | AC network/admin role assign/revoke with CSRF | HTTP 303 success on authorized mutation | HTTP **403** | YES (leaf in Phase B log) |
| `RC_MEDIA_UPLOAD_403` | Shared editor media upload for authorized editor | HTTP 200 + preview URL | HTTP **403** | YES |
| `RC_ANN_PLATFORM_PUBLISH_403` | Testing policy allowPlatformAdminPublish for platform_admin | HTTP 200 publish | HTTP **403** | YES |
| `RC_HTTP_AUTHZ_STATUS` (`v7-branch-editor-canonical-actions`) | Branch history/styles/seo under branch prefix | HTTP 200 | HTTP **403** `forbidden` | YES |

These may still resolve as **fixture/CSRF/host/policy-flag** issues after Wave 1. Do not patch production authz until repro isolates application vs test.

### TEST_ONLY_DEFECT (dominant)

CSS fingerprints, Content Library labels, Stitch chrome regex, release-notes catalogue, org-settings expectation drift (\`403\` vs \`303\` after authz tighten — see commit \`1120e52a\` direction), public HTML nav pins, opaque empty assertion payloads.

---

## 7. Billing dirty-fix reconciliation

| Field | Value |
|---|---|
| Commit | \`ebc29701\` — \`fix(ac): reject foreign-tenant patientIds on billing writes\` |
| Change | \`assertPatientInTenant\` (org-scoped) in \`activeClinicBillingService.js\` + \`SEC-AC-BILLING-FOREIGN-PATIENT\` in \`activeclinic-finance-rbac.test.js\` |
| \`BILLING_FIX_RELATED_RC\` | **NONE** — **0** billing/invoice/cashier/finance leaves inside the 294 |
| \`BUG_REPRODUCED_WITHOUT_FIX\` | **NO** (not re-probed this pass; no billing failure present to bisect) |
| \`FIX_VALIDATED\` | **YES** against current failure set (billing not failing); historical negative coverage landed in-tree |
| \`SHOULD_INTEGRATE\` | **ALREADY_INTEGRATED** — do not re-integrate; no action for reducing 294 |

```
BILLING_FIX_STATUS=ALREADY_INTEGRATED_NO_IMPACT_ON_294
```

---

## 8. Remediation waves (plan only — do not implement here)

| Wave | Focus | ROOT_CAUSES | CURRENT_FAILURES_AFFECTED | QA_SCENARIOS_AFFECTED | RC_IDs (sample) |
|--|--|--:|--:|--:|--|
| WAVE_1 | High-multiplier prerequisites / fixtures / env | 6 | 36 | 10 | `RC_FIXTURE_BRANCH_NOT_FOUND`, `RC_REG_PHONE_FIXTURE`, `RC_HOST_PRODUCT_ROUTING`, `RC12_PLATFORM_LINE_HOST`, `RC_DB_BOOTSTRAP_SEED`, `RC_TIMEOUT` |
| WAVE_2 | P1 authz — authorized actor write denied | 4 | 5 | 4 | `RC_AC_ROLES_WRITE_403`, `RC_MEDIA_UPLOAD_403`, `RC_ANN_PLATFORM_PUBLISH_403`, `RC_HTTP_AUTHZ_STATUS` |
| WAVE_3 | Functional HTTP / validation / registration / publish / media | 12 | 83 | 11 | `RC_HTTP_301_REDIRECT`, `RC_HTTP_STATUS_MISMATCH`, `RC_REG_CONTRACT`, `RC_REG_PROVISION_PATH`, `RC_REG_APPROVAL_FLOW`, `RC_REG_IDEMPOTENCY`… |
| WAVE_4 | Stale UI/CSS/HTML contracts & opaque asserts | 9 | 170 | 17 | `RC10_CSS_FINGERPRINT`, `RC22_REGEX_HTML_CONTRACT`, `RC06_LIBRARY_LABEL`, `RC_PUBLIC_NAV_HTML`, `RC_WE_STITCH_CHROME`, `RC_RELEASE_NOTES_CATALOGUE`… |
| WAVE_5 | Residual QA matrix re-verification after Waves 1–4 | 0 | 0 | 0 |  |

### Wave intent

- **WAVE 1** — Unblock cascades: \`branch_not_found\`, phone fixtures, host/foundation env, DB bootstrap/seed, timeouts.  
- **WAVE 2** — Investigate/fix P1 authorized-write 403/forbidden with security review (no weakening).  
- **WAVE 3** — 301 canonicalization, HTTP status contracts, registration/approval, announcements, media DTO, E2E cascade.  
- **WAVE 4** — CSS/HTML/library/Stitch/release-notes + reduce UNKNOWN via leaf-by-leaf assert triage.  
- **WAVE 5** — Re-run Phase C QA matrix only; expect \`QA_FAILURES_OUTSIDE_294=0\` already, so this is confirmation \`QA_PASSING→98\` after Waves 1–4.

---

## 9. Marker

```text
V2_03_294_FAILURES_QA_GAPS_TRIAGED
CANONICAL_FAILURES=294
FAILED_TEST_FILES=155
UNIQUE_FAILURE_SIGNATURES=147
UNIQUE_ROOT_CAUSES=31
QA_TOTAL=98
QA_PASSING=66
QA_NOT_PASSING=32
QA_FAILURES_INSIDE_294=32
QA_FAILURES_OUTSIDE_294=0
QA_NOT_EXECUTED=0
QA_SKIPPED=0
P0=0
P1=5
P2=118
P3=99
TEST_DEBT_ONLY=72
PROVEN_APPLICATION_DEFECTS=0
SUSPECTED_APPLICATION_DEFECTS=4
BILLING_FIX_STATUS=ALREADY_INTEGRATED_NO_IMPACT_ON_294
COVERAGE_CAMPAIGN=FROZEN
PRODUCTION=UNTOUCHED
```
