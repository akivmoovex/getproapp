# V2.03 QA Automation Green Gate (Phase C)

**FINAL: `V2_03_QA_AUTOMATION_BLOCKED`**

## Gate verdict

| Field | Value |
|---|---|
| Prerequisite `V2_03_CANONICAL_SUITE_GREEN` | **NOT MET** — see `docs/qa/V2_03_CANONICAL_GREEN_GATE.md` (`FAIL=294`) |
| Branch | `V10` |
| Tip at gate | `32e83bd5` |
| Matrix source | `docs/qa/V2_03_QA_AUTOMATION_MATRIX.md` |
| Execution artifacts | `/tmp/v203-phase-c/` (+ refine `/tmp/v203-phase-c-refine/`) |
| `PRODUCTION` | **UNTOUCHED** |

### Required counts

```
QA_TOTAL=98
QA_AUTOMATION_EXISTS=98
QA_EXECUTED=98
QA_PASSING=66
```

**Required for green:** `QA_PASSING=98`. **Observed:** `66` → **BLOCKED**.

### Distinction enforced

| Layer | Meaning | Result |
|---|---|---|
| `AUTOMATION_EXISTS` | Cited test file(s) present for every QA_ID (packs expanded) | **98/98** |
| `EXECUTED` | File(s) actually run under `node --test --test-concurrency=1` | **98/98** |
| `PASSING` | Every cited file exited 0 (no failing leaf) | **66/98** |

Inventory-only `AUTOMATED=YES` in the matrix is **not** treated as pass evidence.

## How execution was proven

1. Parsed all **98** matrix rows → `/tmp/v203-phase-c/execution-ledger.json`.
2. Expanded pack citations:
   - `BB-V203-REG` → `npm run test:v203:bb-regression` file list (**25** files).
   - `AC-V203-E2E` → `tests/v203-end-to-end-journeys.test.js` (journey map SoT).
3. Unique cited files: **170** (all present on disk).
4. Coarse batched run (`BATCH_SIZE=10`) → `/tmp/v203-phase-c/` (EXECUTED proof; failed batches over-attributed).
5. Refine pass: **130** non-green files re-run **one file per process** (`BATCH_SIZE=1`) → authoritative per-file exit codes.
6. Merged census → `/tmp/v203-phase-c/qa-id-results-final.json`.

Runners: `scripts/qa/run-qa-matrix-automation-batched.js`, `scripts/qa/launch-qa-matrix-automation-batched.sh`.

## Product rollup

| Product | Total | Passing | Failing |
|---|---:|---:|---:|
| SHARED | 27 | 15 | 12 |
| BLESSBOARD | 30 | 15 | 15 |
| ACTIVECLINIC | 34 | 32 | 2 |
| PLATFORM | 7 | 4 | 3 |
| **ALL** | **98** | **66** | **32** |

## Failing QA_IDs (32) — first failing leaf theme

| QA_ID | PRODUCT | Failing leaf / first assertion theme |
|--|--|--|
| SH-AUTH-01 | SHARED | blessboard-auth-http.test.js: platform_admin login redirects to /admin and honors safe next paths |
| SH-AUTH-04 | SHARED | blessboard-auth-http.test.js: platform_admin login redirects to /admin and honors safe next paths |
| SH-AUTH-05 | SHARED | activeclinic-unified-login.test.js: Stage 4: unified deployment resolves products by host without leakage; v7-runtime-env-isolation.test.js: resolves products by host and rejects production hosts on t |
| SH-ID-01 | SHARED | blessboard-registration-phone.test.js: migration adds normalized column and active unique index |
| SH-REG-02 | SHARED | blessboard-instant-free-registration.test.js: explicit false disables automatic provisioning and uses enquiry behavior |
| SH-MED-01 | SHARED | v2-shared-media-upload-parity.test.js: inline editor action labels match Content Library wording for both products |
| SH-MED-02 | SHARED | v2-shared-media-upload-parity.test.js: inline editor action labels match Content Library wording for both products |
| SH-DFT-01 | SHARED | v7-website-draft-live-integrity.test.js: 1 anonymous visitors read published content only; v2-01-unpublished-changes-panel.test.js: wires shared panel into BB + AC shells and APIs with tenant-scoped U |
| SH-WE-01 | SHARED | shared-website-editor-wave1.test.js: BlessBoard and ActiveClinic render the shared Stitch editor chrome; shared-website-editor-wave2.test.js: BlessBoard and ActiveClinic render shared field editor hos |
| SH-VER-01 | SHARED | v2-01-release-notes-center.test.js: lists all seven versions; v7-getpro-testing-foundation.test.js: platform runtime serves GetPro foundation on getproapp.pronline.org |
| SH-HOST-01 | SHARED | v7-runtime-env-isolation.test.js: resolves products by host and rejects production hosts on testing; activeclinic-unified-login.test.js: Stage 4: unified deployment resolves products by host without l |
| SH-HOST-02 | SHARED | v7-runtime-env-isolation.test.js: resolves products by host and rejects production hosts on testing; v7-getpro-testing-foundation.test.js: platform runtime serves GetPro foundation on getproapp.pronli |
| BB-REG-01 | BLESSBOARD | blessboard-instant-free-registration.test.js: explicit false disables automatic provisioning and uses enquiry behavior |
| BB-REG-04 | BLESSBOARD | blessboard-registration-risk-review.test.js: 2. confirmed duplicate phone is blocked (reject, no provision); blessboard-registration-operator-approval.test.js: 8. Foundation approve-and-provision is i |
| BB-REG-05 | BLESSBOARD | blessboard-registration-approval-flow-ui.test.js: includes mobile-friendly full-width confirmation hooks; blessboard-registration-approval-invitation.test.js: 2–3. Missing password does not block Foun |
| BB-BR-03 | BLESSBOARD | blessboard-branch-mini-websites.test.js: 1. Existing church-wide URL still works; blessboard-branch-mini-website-shell.test.js: 1. Branch name is visible |
| BB-PUB-HOME | BLESSBOARD | church-public-home-ministries-regression.test.js: 13-16 duplication and unsupported actions absent |
| BB-PAGE-HOME | BLESSBOARD | v2-bb-home-leaders-image.test.js: structured editor hydrates upload/library URLs from media.publicSrc (shared CDN  |
| BB-PAGE-LEAD | BLESSBOARD | v2-bb-home-leaders-image.test.js: structured editor hydrates upload/library URLs from media.publicSrc (shared CDN  |
| BB-PAGE-MIN | BLESSBOARD | church-public-home-ministries-regression.test.js: 13-16 duplication and unsupported actions absent |
| BB-PAGE-EVT | BLESSBOARD | church-public-events-sermons-visual.test.js: 25-27 active nav, Member Login, Register remain |
| BB-PAGE-SER | BLESSBOARD | church-public-events-sermons-visual.test.js: 25-27 active nav, Member Login, Register remain |
| BB-ANN-01 | BLESSBOARD | blessboard-announcements.test.js: evaluates platform publish policy without silent publish |
| BB-ANN-03 | BLESSBOARD | blessboard-announcements.test.js: evaluates platform publish policy without silent publish; blessboard-announcement-platform-admin-testing-policy.test.js: capability publish follows allowPlatformAdmin |
| BB-PAGE-GIV | BLESSBOARD | church-public-giving-contact-visual.test.js: 18-23 contact form, validation, success/error, and existing protections |
| BB-MED-01 | BLESSBOARD | v2-shared-media-upload-parity.test.js: inline editor action labels match Content Library wording for both products |
| BB-V203-E2E | BLESSBOARD | v7-local-registration-to-website-e2e.test.js: walks ActiveClinic and BlessBoard from registration through restore |
| AC-STAFF-01 | ACTIVECLINIC | activeclinic-roles-access-admin.test.js: multi-role assign and single-role revoke recalculate access; activeclinic-roles-access-parity.test.js: network admin assigns, edits expiry, and revokes with CS |
| AC-RBAC-01 | ACTIVECLINIC | activeclinic-roles-access-admin.test.js: multi-role assign and single-role revoke recalculate access; activeclinic-roles-access-parity.test.js: network admin assigns, edits expiry, and revokes with CS |
| PL-DB-01 | PLATFORM | db-bootstrap-foundation.test.js: empty database bootstrap succeeds and creates schemas/tables/seeds; db-foundation.test.js: clean migration applies schemas, ledger, identity, deployments, tenant catal |
| PL-DB-02 | PLATFORM | migration-tooling.test.js: applies idempotently and resumes from checkpoints |
| PL-ADM-01 | PLATFORM | blessboard-announcement-platform-admin-testing-policy.test.js: capability publish follows allowPlatformAdminPublish only for platform_admin; blessboard-platform-admin-directory.test.js: user detail pr |

### Failure theme clusters (not fixed in Phase C)

| Cluster | Examples | Notes |
|---|---|---|
| Host / runtime env contracts | `v7-runtime-env-isolation`, `v7-getpro-testing-foundation`, `v7-domain-resolved-platform`, `activeclinic-unified-login` | Assert mismatches on host→product routing / production-host rejection on testing |
| Registration / approval flows | instant-free, risk-review, operator-approval, approval UI/invitation | Strict equality / provisioning path drift |
| Public / visual HTML contracts | church-public-*-visual/regression, branch mini-websites | Nav/chrome/assert pins (functional HTML, not Stitch pixels) |
| Shared editor / media labels | shared-website-editor-wave1/2, media upload parity, unpublished panel | Stitch chrome / Content Library wording |
| AC roles admin/parity | `activeclinic-roles-access-admin`, `activeclinic-roles-access-parity` | CSRF/role mutation equality |
| Platform DB bootstrap/migrate | `db-bootstrap-foundation`, `db-foundation`, `migration-tooling` | Schema/seed/checkpoint asserts |
| Announcements / platform admin policy | announcements + platform-admin testing policy / directory | Publish policy / projection asserts |
| E2E journey | `v7-local-registration-to-website-e2e` | Full walk still red |

## MANUAL_VISUAL_ONLY (outside the 98)

No CURRENT matrix scenario is scenario-scoped to subjective Stitch **pixel** judgment.

| Item | Why not counted as matrix automation |
|---|---|
| Stitch pixel-perfect parity (Batch readiness `MANUAL_QA_REQUIRED`) | Requires human visual compare against Stitch; class-name / CSS fingerprint asserts are explicitly **not** accepted as substitute |
| Public “visual” test files that **failed** | Failures are **functional HTML/nav/content contracts** (HTTP + DOM text), not pixel diffs — they remain in the 98 and count as FAIL until fixed |

`MANUAL_VISUAL_ONLY` for the 98-scenario catalogue: **0**.

## Full scenario execution map (98)

| QA_ID | PRODUCT | FUNCTION | TEST_FILE | TEST_CASE | AUTOMATION_EXISTS | EXECUTED | PASSED | POSITIVE_PATH | NEGATIVE_PATH | PERSISTENCE | TENANT_BOUNDARY |
|--|--|--|--|--|--|--|--|--|--|--|--|
| SH-AUTH-01 | SHARED | auth/login | `v8-shared-auth-password-security.test.js, blessboard-auth-http.test.js, +1` | SH-AUTH-01 | YES | YES | NO | Y | N | N | N |
| SH-AUTH-02 | SHARED | auth/login | `v8-shared-session-security.test.js, blessboard-phone-login.test.js, +2` | SH-AUTH-02 | YES | YES | YES | Y | Y | Y | Y |
| SH-AUTH-03 | SHARED | auth/login | `v8-shared-auth-password-security.test.js, activeclinic-acw08-auth.test.js` | SH-AUTH-03 | YES | YES | YES | Y | Y | N | N |
| SH-AUTH-04 | SHARED | auth/login | `activeclinic-logout-after-switch.test.js, v8-shared-session-security.test.js, +2` | SH-AUTH-04 | YES | YES | NO | Y | Y | Y | N |
| SH-AUTH-05 | SHARED | auth/login | `activeclinic-unified-login.test.js, v7-runtime-env-isolation.test.js, +2` | SH-AUTH-05 | YES | YES | NO | Y | Y | N | Y |
| SH-ID-01 | SHARED | phone/email identity | `v7-shared-phone-identity.test.js, v7-bb-ac-phone-parity.test.js, +1` | SH-ID-01 | YES | YES | NO | Y | Y | Y | N |
| SH-ID-02 | SHARED | phone/email identity | `v8-shared-verification.test.js, blessboard-registration-email-verification-delivery.test.js, +2` | SH-ID-02 | YES | YES | YES | Y | Y | Y | N |
| SH-ID-03 | SHARED | phone/email identity | `blessboard-phone-login.test.js, v7-shared-phone-identity.test.js, +1` | SH-ID-03 | YES | YES | YES | Y | Y | Y | N |
| SH-REG-01 | SHARED | registration | `v7-unified-registration-engine.test.js` | SH-REG-01 | YES | YES | YES | Y | Y | Y | N |
| SH-REG-02 | SHARED | registration | `blessboard-instant-free-registration.test.js, activeclinic-clinic-onboarding.test.js, +2` | SH-REG-02 | YES | YES | NO | Y | Y | Y | Y |
| SH-TEN-01 | SHARED | tenant isolation | `v8-shared-rbac-tenant-isolation.test.js, v8-tenant-product-isolation.test.js, +1` | SH-TEN-01 | YES | YES | YES | Y | Y | N | Y |
| SH-TEN-02 | SHARED | tenant isolation | `v10-pc02-platform-consolidation-characterization.test.js, v8-shared-rbac-tenant-isolation.test.js, +2` | SH-TEN-02 | YES | YES | YES | Y | Y | Y | Y |
| SH-RBAC-01 | SHARED | RBAC | `v8-shared-rbac-tenant-isolation.test.js, blessboard-authorization.test.js, +1` | SH-RBAC-01 | YES | YES | YES | Y | Y | N | N |
| SH-RBAC-02 | SHARED | RBAC | `v2-02-bb-catalogue-only-rbac.test.js, v2-02-legacy-rbac-removal.test.js, +1` | SH-RBAC-02 | YES | YES | YES | Y | Y | Y | N |
| SH-MED-01 | SHARED | media upload | `v10-pc08-platform-media-consolidation.test.js, v2-shared-media-upload-parity.test.js, +3` | SH-MED-01 | YES | YES | NO | Y | Y | Y | Y |
| SH-MED-02 | SHARED | media library | `v2-shared-media-upload-parity.test.js, v2-01-universal-image-editor.test.js, +2` | SH-MED-02 | YES | YES | NO | Y | Y | Y | Y |
| SH-MED-03 | SHARED | media library | `blessboard-media.test.js, v8-tenant-product-isolation.test.js, +1` | SH-MED-03 | YES | YES | YES | Y | Y | N | Y |
| SH-PUB-01 | SHARED | publish/unpublish | `v10-pc10-publication-convergence.test.js, v10-pc10b-ac-website-workflow-baseline.test.js, +2` | SH-PUB-01 | YES | YES | YES | Y | Y | Y | Y |
| SH-PUB-02 | SHARED | publish/unpublish | `blessboard-p0-publish-auth.test.js, v10-pc10b-ac-website-workflow-baseline.test.js` | SH-PUB-02 | YES | YES | YES | Y | Y | Y | N |
| SH-DFT-01 | SHARED | draft/reload | `v7-website-draft-live-integrity.test.js, v2-01-unpublished-changes-panel.test.js, +2` | SH-DFT-01 | YES | YES | NO | Y | Y | Y | N |
| SH-WE-01 | SHARED | website editing | `v7-shared-website-editor.test.js, v2-01-bb-inline-editor-parity.test.js, +3` | SH-WE-01 | YES | YES | NO | Y | Y | Y | N |
| SH-WE-02 | SHARED | website editing | `v2-01-shared-section-management.test.js, v2-bb-leadership-section-management.test.js` | SH-WE-02 | YES | YES | YES | Y | Y | Y | N |
| SH-IMG-01 | SHARED | image placement | `v2-01-universal-image-editor.test.js, v2-02-universal-image-editor-coverage.test.js, +1` | SH-IMG-01 | YES | YES | YES | Y | Y | Y | N |
| SH-IMG-02 | SHARED | image placement | `v2-02-structured-image-framing-lifecycle.test.js, v2-bb-ministry-image-edit.test.js, +2` | SH-IMG-02 | YES | YES | YES | Y | Y | Y | N |
| SH-VER-01 | SHARED | version/about | `v2-01-release-notes-center.test.js, v7-getpro-testing-foundation.test.js, +1` | SH-VER-01 | YES | YES | NO | Y | N | N | N |
| SH-HOST-01 | SHARED | domain/product routing | `v7-runtime-env-isolation.test.js, activeclinic-unified-login.test.js, +1` | SH-HOST-01 | YES | YES | NO | Y | Y | N | Y |
| SH-HOST-02 | SHARED | domain/product routing | `v7-runtime-env-isolation.test.js, v7-getpro-testing-foundation.test.js` | SH-HOST-02 | YES | YES | NO | Y | Y | N | Y |
| BB-REG-01 | BLESSBOARD | church registration | `blessboard-instant-free-registration.test.js, blessboard-register-church.test.js` | BB-REG-01 | YES | YES | NO | Y | Y | Y | N |
| BB-REG-02 | BLESSBOARD | church registration | `blessboard-growth-trial-registration.test.js` | BB-REG-02 | YES | YES | YES | Y | Y | Y | N |
| BB-REG-03 | BLESSBOARD | church registration | `blessboard-network-support-registration.test.js, blessboard-growth-trial-expiry.test.js, +2` | BB-REG-03 | YES | YES | YES | Y | Y | Y | N |
| BB-REG-04 | BLESSBOARD | church registration | `blessboard-registration-risk-review.test.js, blessboard-registration-operator-approval.test.js` | BB-REG-04 | YES | YES | NO | Y | Y | Y | N |
| BB-REG-05 | BLESSBOARD | church registration | `blessboard-registration-approval-checklist-ui.test.js, blessboard-registration-approval-checklist.test.js, +2` | BB-REG-05 | YES | YES | NO | Y | Y | Y | N |
| BB-HQ-01 | BLESSBOARD | HQ/branch behavior | `blessboard-hq-shell.test.js, blessboard-authorization.test.js` | BB-HQ-01 | YES | YES | YES | Y | Y | N | Y |
| BB-BR-01 | BLESSBOARD | HQ/branch behavior | `blessboard-branch-admin-shell.test.js, v8-shared-form-studio-authz.test.js` | BB-BR-01 | YES | YES | YES | Y | Y | N | Y |
| BB-BR-02 | BLESSBOARD | HQ/branch behavior | `blessboard-branch-admin-shell.test.js` | BB-BR-02 | YES | YES | YES | Y | Y | N | N |
| BB-BR-03 | BLESSBOARD | HQ/branch behavior | `blessboard-branch-mini-websites.test.js, blessboard-branch-mini-website-shell.test.js, +1` | BB-BR-03 | YES | YES | NO | Y | Y | N | Y |
| BB-PUB-HOME | BLESSBOARD | website pages | `blessboard-public-pages.test.js, church-public-home-ministries-regression.test.js, +1` | BB-PUB-HOME | YES | YES | NO | Y | N | N | Y |
| BB-PAGE-HOME | BLESSBOARD | Home | `v2-bb-home-leaders-image.test.js, v2-bb-home-leaders-text.test.js, +1` | BB-PAGE-HOME | YES | YES | NO | Y | Y | Y | N |
| BB-PAGE-ABOUT | BLESSBOARD | About | `blessboard-public-pages.test.js, blessboard-content-admin.test.js` | BB-PAGE-ABOUT | YES | YES | YES | Y | Y | Y | N |
| BB-PAGE-LEAD | BLESSBOARD | Leadership | `v2-bb-leadership-data-loss.test.js, v2-bb-leadership-section-management.test.js, +2` | BB-PAGE-LEAD | YES | YES | NO | Y | Y | Y | N |
| BB-PAGE-MIN | BLESSBOARD | Ministries | `church-branch-ministries.test.js, v2-bb-ministry-image-edit.test.js, +2` | BB-PAGE-MIN | YES | YES | NO | Y | Y | Y | N |
| BB-PAGE-EVT | BLESSBOARD | Events | `church-growth-advanced-events.test.js, church-branch-announcements-events.test.js, +2` | BB-PAGE-EVT | YES | YES | NO | Y | Y | Y | N |
| BB-PAGE-SER | BLESSBOARD | Sermons | `v2-02-sermon-creation-regression.test.js, v2-bb-sermon-image-persistence.test.js, +1` | BB-PAGE-SER | YES | YES | NO | Y | Y | Y | N |
| BB-ANN-01 | BLESSBOARD | Announcements | `blessboard-announcements.test.js, v8-shared-announcements.test.js` | BB-ANN-01 | YES | YES | NO | Y | Y | Y | Y |
| BB-ANN-02 | BLESSBOARD | Announcements | `v2-02-announcements-document-upload-regression.test.js` | BB-ANN-02 | YES | YES | YES | Y | Y | Y | N |
| BB-ANN-03 | BLESSBOARD | Announcements | `blessboard-announcements.test.js, blessboard-announcement-platform-admin-testing-policy.test.js` | BB-ANN-03 | YES | YES | NO | Y | Y | N | N |
| BB-PAGE-CON | BLESSBOARD | Contact | `v2-bb-contact-hours-edit.test.js, v2-bb-contact-image-replace.test.js, +1` | BB-PAGE-CON | YES | YES | YES | Y | Y | Y | N |
| BB-PAGE-GIV | BLESSBOARD | Giving | `blessboard-giving.test.js, blessboard-finance-separation.test.js, +1` | BB-PAGE-GIV | YES | YES | NO | Y | Y | Y | N |
| BB-MED-01 | BLESSBOARD | media | `blessboard-media.test.js, v2-shared-media-type-conversion.test.js, +1` | BB-MED-01 | YES | YES | NO | Y | Y | Y | Y |
| BB-CMS-01 | BLESSBOARD | content editing | `blessboard-content-admin.test.js, v10-pc11-cms-convergence.test.js, +2` | BB-CMS-01 | YES | YES | YES | Y | Y | Y | N |
| BB-PUB-01 | BLESSBOARD | publishing | `blessboard-p0-publish-auth.test.js, v7-blessboard-publish-engine-bridge.test.js, +2` | BB-PUB-01 | YES | YES | YES | Y | Y | Y | Y |
| BB-PUB-02 | BLESSBOARD | publishing | `phase4-restore-previous-website.test.js, phase3-website-version-compare-restore.test.js, +2` | BB-PUB-02 | YES | YES | YES | Y | Y | Y | N |
| BB-RBAC-01 | BLESSBOARD | roles/access | `blessboard-staff-invitation.test.js, blessboard-hq-roles.test.js, +1` | BB-RBAC-01 | YES | YES | YES | Y | Y | Y | Y |
| BB-RBAC-02 | BLESSBOARD | roles/access | `v2-02-legacy-rbac-removal.test.js, v10-dbcl04-canonical-cleanup-baseline.test.js` | BB-RBAC-02 | YES | YES | YES | Y | Y | Y | N |
| BB-V202-IMG | BLESSBOARD | V2.02 QA | `v2-02-universal-image-editor-coverage.test.js, v2-02-structured-image-framing-lifecycle.test.js` | BB-V202-IMG | YES | YES | YES | Y | Y | Y | N |
| BB-V203-E2E | BLESSBOARD | V2.03 QA | `v7-local-registration-to-website-e2e.test.js` | BB-V203-E2E | YES | YES | NO | Y | Y | Y | Y |
| BB-V203-REG | BLESSBOARD | V2.03 QA | `v2-02-legacy-rbac-removal.test.js, v2-02-bb-catalogue-only-rbac.test.js, +23` | BB-V203-REG | YES | YES | YES | Y | Y | Y | Y |
| AC-REG-01 | ACTIVECLINIC | clinic registration | `activeclinic-acw09-registration.test.js, activeclinic-clinic-registration.test.js, +2` | AC-REG-01 | YES | YES | YES | Y | Y | Y | N |
| AC-REG-02 | ACTIVECLINIC | clinic registration | `activeclinic-registration-terms.test.js, activeclinic-clinic-registration.test.js` | AC-REG-02 | YES | YES | YES | Y | Y | N | N |
| AC-SETUP-01 | ACTIVECLINIC | first login/setup | `activeclinic-batch1a-config.test.js` | AC-SETUP-01 | YES | YES | YES | Y | Y | Y | N |
| AC-FAC-01 | ACTIVECLINIC | facilities | `activeclinic-batch2-facilities.test.js, activeclinic-facility-foundation.test.js, +1` | AC-FAC-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-FAC-02 | ACTIVECLINIC | facilities | `activeclinic-batch2-rbac-isolation.test.js` | AC-FAC-02 | YES | YES | YES | Y | Y | N | Y |
| AC-STAFF-01 | ACTIVECLINIC | staff/invites | `activeclinic-staff-invitation.test.js, activeclinic-roles-access-admin.test.js, +1` | AC-STAFF-01 | YES | YES | NO | Y | Y | Y | Y |
| AC-STAFF-02 | ACTIVECLINIC | staff/invites | `activeclinic-staff-invitation.test.js` | AC-STAFF-02 | YES | YES | YES | Y | Y | N | N |
| AC-DEPT-01 | ACTIVECLINIC | departments | `activeclinic-batch2-facilities.test.js` | AC-DEPT-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-PAT-01 | ACTIVECLINIC | patients | `activeclinic-batch1a-patient-reception.test.js, activeclinic-batch2-patient-workspace.test.js` | AC-PAT-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-PAT-02 | ACTIVECLINIC | patients | `activeclinic-patient-foundation.test.js, activeclinic-patient-merge-safety.test.js, +2` | AC-PAT-02 | YES | YES | YES | Y | Y | Y | Y |
| AC-APT-01 | ACTIVECLINIC | appointments | `activeclinic-batch1a-appointments.test.js, activeclinic-batch2-appointments-workspace.test.js` | AC-APT-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-APT-02 | ACTIVECLINIC | appointments | `activeclinic-batch2-rbac-isolation.test.js` | AC-APT-02 | YES | YES | YES | Y | Y | N | Y |
| AC-BOOK-01 | ACTIVECLINIC | booking | `activeclinic-public-booking.test.js, activeclinic-mf10-booking.test.js, +2` | AC-BOOK-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-BOOK-02 | ACTIVECLINIC | booking | `activeclinic-patient-portal.test.js, activeclinic-mf08-patient-registration.test.js, +2` | AC-BOOK-02 | YES | YES | YES | Y | Y | Y | Y |
| AC-CLIN-01 | ACTIVECLINIC | clinical | `activeclinic-batch1a-clinical.test.js, activeclinic-batch2-clinical-encounter.test.js` | AC-CLIN-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-CLIN-02 | ACTIVECLINIC | clinical | `activeclinic-batch3-acn17-acn19.test.js` | AC-CLIN-02 | YES | YES | YES | Y | Y | Y | Y |
| AC-CLIN-03 | ACTIVECLINIC | clinical | `activeclinic-batch3-acn18-clinical-documents.test.js` | AC-CLIN-03 | YES | YES | YES | Y | Y | Y | Y |
| AC-CLIN-04 | ACTIVECLINIC | clinical | `activeclinic-batch3-acn17-acn19.test.js` | AC-CLIN-04 | YES | YES | YES | Y | Y | Y | Y |
| AC-CLIN-05 | ACTIVECLINIC | clinical | `activeclinic-batch3-acn20.test.js` | AC-CLIN-05 | YES | YES | YES | Y | N | N | N |
| AC-PHARM-01 | ACTIVECLINIC | pharmacy | `activeclinic-batch2-operational-queues.test.js, activeclinic-pharmacy-foundation.test.js, +2` | AC-PHARM-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-LAB-01 | ACTIVECLINIC | laboratory | `activeclinic-batch2-operational-queues.test.js, activeclinic-diagnostics-foundation.test.js, +3` | AC-LAB-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-RAD-01 | ACTIVECLINIC | radiology | `activeclinic-batch2-operational-queues.test.js, activeclinic-diagnostics-foundation.test.js, +3` | AC-RAD-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-BILL-01 | ACTIVECLINIC | billing | `activeclinic-batch1a-billing.test.js, activeclinic-batch2-billing.test.js, +1` | AC-BILL-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-BILL-02 | ACTIVECLINIC | billing | `activeclinic-batch1a-billing.test.js, activeclinic-finance-rbac.test.js` | AC-BILL-02 | YES | YES | YES | Y | Y | Y | N |
| AC-RBAC-01 | ACTIVECLINIC | access/RBAC | `activeclinic-batch2-rbac-isolation.test.js, activeclinic-roles-access-admin.test.js, +2` | AC-RBAC-01 | YES | YES | NO | Y | Y | N | Y |
| AC-WEB-01 | ACTIVECLINIC | website/editor | `v10-pc10b-ac-website-workflow-baseline.test.js, activeclinic-website-cms.test.js, +3` | AC-WEB-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-PUB-01 | ACTIVECLINIC | public clinic pages | `activeclinic-public-website.test.js, activeclinic-clinic-website-availability.test.js, +1` | AC-PUB-01 | YES | YES | YES | Y | Y | N | Y |
| AC-PORT-01 | ACTIVECLINIC | patient portal | `activeclinic-patient-portal.test.js, activeclinic-batch3-acp03-acp07.test.js, +3` | AC-PORT-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-PORT-02 | ACTIVECLINIC | patient portal | `activeclinic-batch3-acp05-visit-summary.test.js` | AC-PORT-02 | YES | YES | YES | Y | Y | Y | Y |
| AC-ROOM-01 | ACTIVECLINIC | rooms/spaces | `activeclinic-batch3-acn27-rooms.test.js` | AC-ROOM-01 | YES | YES | YES | Y | Y | Y | Y |
| AC-B1-NAV | ACTIVECLINIC | Batch1 | `activeclinic-batch1a-appointments.test.js, activeclinic-batch1a-billing.test.js, +2` | AC-B1-NAV | YES | YES | YES | Y | Y | N | N |
| AC-B2-NAV | ACTIVECLINIC | Batch2 | `activeclinic-batch2-appointments-workspace.test.js, activeclinic-batch2-billing.test.js, +2` | AC-B2-NAV | YES | YES | YES | Y | Y | Y | Y |
| AC-B3-NAV | ACTIVECLINIC | Batch3 | `activeclinic-batch3-acn17-acn19.test.js, activeclinic-batch3-acn18-clinical-documents.test.js, +2` | AC-B3-NAV | YES | YES | YES | Y | Y | Y | Y |
| AC-V203-E2E | ACTIVECLINIC | V2.03 QA | `v203-end-to-end-journeys.test.js` | AC-V203-E2E | YES | YES | YES | Y | Y | Y | Y |
| PL-DB-01 | PLATFORM | migrations/bootstrap | `db-bootstrap-foundation.test.js, db-foundation.test.js, +1` | PL-DB-01 | YES | YES | NO | Y | Y | Y | N |
| PL-DB-02 | PLATFORM | migrations/bootstrap | `migration-tooling.test.js, v5-to-v7-migration-tooling.test.js` | PL-DB-02 | YES | YES | NO | Y | Y | Y | N |
| PL-ADM-01 | PLATFORM | platform admin | `v7-platform-admin-tenant-health.test.js, v7-platform-admin-website-control.test.js, +2` | PL-ADM-01 | YES | YES | NO | Y | Y | N | Y |
| PL-ENT-01 | PLATFORM | entitlements | `platform-entitlements.test.js, phase4-website-plan-entitlements.test.js` | PL-ENT-01 | YES | YES | YES | Y | Y | Y | N |
| PL-PUB-01 | PLATFORM | publication convergence | `v10-pc10b-ac-website-workflow-baseline.test.js, v10-pc10b-bb-publish-baselines.test.js, +1` | PL-PUB-01 | YES | YES | YES | Y | Y | Y | Y |
| PL-MED-01 | PLATFORM | media consolidation | `v10-pc08-platform-media-consolidation.test.js` | PL-MED-01 | YES | YES | YES | Y | Y | Y | Y |
| PL-SEC-01 | PLATFORM | security | `v8-shared-rbac-tenant-isolation.test.js, blessboard-p0-publish-auth.test.js` | PL-SEC-01 | YES | YES | YES | Y | Y | Y | Y |

## Marker

```text
V2_03_QA_AUTOMATION_BLOCKED
QA_TOTAL=98
QA_AUTOMATION_EXISTS=98
QA_EXECUTED=98
QA_PASSING=66
PREREQUISITE_CANONICAL_SUITE_GREEN=NO
MANUAL_VISUAL_ONLY=0
PRODUCTION=UNTOUCHED
```
