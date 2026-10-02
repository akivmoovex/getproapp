# V2.04 Recent Bug-Fix Audit

**Mode:** Verification + fix applied for PLATFORM-PASSWORD-UX-01.  
**Date:** 2026-10-02  
**Method:** Existing QA/audit docs first → current code paths → focused test assertions (not generic route rendering).  
**Scope:** Registration, provisioning, website editing, password UX, ActiveClinic patient security.

---

## Summary

| BUG_ID | STATUS | Primary fix locus | Focused tests |
|--------|--------|-------------------|--------------:|
| REG-STATE-01 | **FIXED** | PLATFORM | 18 |
| BB-PROVISION-01 | **FIXED** | BlessBoard | 11 |
| BB-REG-WEB-01 | **FIXED** (success receipt Edit CTA; POST now → `/hq` per BB-POST-REG-DASHBOARD-01) | BlessBoard (+ shared presentation) | 4 |
| BB-POST-REG-DASHBOARD-01 | **FIXED** | BlessBoard (redirect only; shared session) | 5 |
| AC-REG-WEB-01 | **FIXED** | ActiveClinic (+ shared URL helper) | 4 |
| PLATFORM-PASSWORD-UX-01 | **FIXED** | AC admin-step init of shared component | 7 |
| AC-WEB-EDITOR-01 | **FIXED** | ActiveClinic management hub (no fake canvas) | 9 |
| AC-INITIAL-DIRTY-STATE-01 | **FIXED** | PLATFORM | 7 |
| AC-SEC-01 | **FIXED** | ActiveClinic (+ EXISTING_STORE) | 5 |
| AC-SEC-02 | **FIXED** | ActiveClinic | 5 |

**REGRESSED:** none found among these nine.

---

## BUG_ID: REG-STATE-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Multi-step registration used signed-cookie drafts, but GET mid-wizard without `gpRegNav=1` cleared valid drafts → prior-step data loss. Documented in `docs/qa/V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md` / `V2_04_FINAL_GAP_AND_TEST_PLAN.md` as CLOSED.

### FIX_PATHS
- `src/platform/registration/registrationDraftLifecycle.js` — `resolveRegistrationDraftForGet` hydrates valid drafts; clear on `?fresh=1` / completed only
- `src/platform/forms/multiStepFormState.js` / merge helpers
- BB + AC registration routes consume shared lifecycle (PRG)

### BEHAVIOR_NOW
Refresh/back mid-wizard restores prior fields without requiring `gpRegNav`. Explicit restart/fresh clears draft. Cross-product draft cookies isolated.

### EXPECTED_BEHAVIOR
Shared BB/AC multi-step registration state persists across mid-wizard GET/refresh; sessionless draft flow works; no silent wipe.

### TEST_FILES
- `tests/v2-04-platform-multi-step-form-state.test.js` (13) — hydrate without `gpRegNav`, tamper, isolation, secrets
- `tests/v2-04-bb-multi-step-registration-draft.test.js` (3)
- `tests/v2-04-ac-multi-step-registration-draft.test.js` (2)

### TEST_COUNT
**18** (focused suites asserting persistence / isolation)

### NEGATIVE_TESTS
**YES** — tampered cookies, invalid drafts

### CROSS_TENANT_TEST
**YES** — cross-product / cross-draft isolation in platform suite

### REGRESSION_TEST
**YES** — BB + AC product draft suites; lifecycle still clears on fresh/complete

### DOCS_UPDATED
**YES** — `V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md`, `V2_04_FINAL_GAP_AND_TEST_PLAN.md`, `V2_04_P0_BURNDOWN.md`

### REMAINING_GAP
None material for stated defect.

---

## BUG_ID: BB-PROVISION-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** After phone-matched identity reuse with a different submitted email, role assignment re-resolved admin by unmatched registration email → `user_not_found` mislabeled `database_conflict`. Audit: `V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`.

### FIX_PATHS
- `src/blessboard/services/provisionRegisteredBlessBoardChurch.js`
  - `buildAdministratorRoleAssignInput` — prefer canonical `userId` / identity email when known
  - `mapRoleAssignmentFailureStatus` — accurate failure mapping

### BEHAVIOR_NOW
Phone-reuse + different email provisions successfully; multi-church admin reuse works; false `database_conflict` avoided.

### EXPECTED_BEHAVIOR
Existing phone-matched identity + different submitted email must not block church provision when password/identity rules allow reuse.

### TEST_FILES
- `tests/v2-04-bb-church-provisioning-phone-reuse.test.js` (11)

### TEST_COUNT
**11**

### NEGATIVE_TESTS
**YES** — rollback / failure paths asserted

### CROSS_TENANT_TEST
**YES** — no foreign org role leakage

### REGRESSION_TEST
**YES** — same-email path / retry / idempotency

### DOCS_UPDATED
**YES** — `V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`, `V2_04_BB_PROVISION_01_KNOWN_ISSUE.md` (=CLOSED), final gap plan

### REMAINING_GAP
Optional hosted smoke only (`T-M22`); not an open code defect.

---

## BUG_ID: BB-REG-WEB-01

### STATUS
**FIXED** (Edit CTA on success receipt); **superseded landing** by `BB-POST-REG-DASHBOARD-01`

### ROOT_CAUSE_CONFIRMED
**YES.** Post-reg landed on `/register-church/success`; primary CTA was `/hq`. Canonical editor URL via `buildPublicWebsiteEditPath` already existed when website resolution succeeded. Audit: `V2_04_REGISTRATION_WEBSITE_EDITOR_BUG_AUDIT.md`.

### FIX_PATHS
- `src/blessboard/services/resolveRegistrationSuccessWebsite.js` — dynamic org/branch + `editPath`
- `src/platform/registration/registrationSuccessPresentation.js` — `showWebsiteEditPrimary`, `websiteBuildLabel: "Edit your website"`
- `views/blessboard/v5/apex/register-church-success-panel.ejs` — primary edit CTA; dashboard secondary

### BEHAVIOR_NOW
**POST** `/register-church` → authenticated **`/hq`** (`BB-POST-REG-DASHBOARD-01`). Success receipt GET by stored `ref` still offers primary **Edit your website** → `/c/:organizationKey/:branchKey?website_edit=1&website_mode=draft`; `/hq` secondary on that page.

### EXPECTED_BEHAVIOR
User can open newly provisioned church site in real edit/draft mode from the success receipt without using `/hq` as the editor entry.

### TEST_FILES
- `tests/blessboard-bb-reg-web-01-editor-route.test.js` (4) — POST→`/hq`; success receipt Edit CTA canonical; org/branch distinct; cross-tenant withhold; failure off editor
- `tests/v2-04-bb-post-registration-dashboard.test.js` — dashboard landing

### TEST_COUNT
**4** (+ 5 dashboard focused)

### NEGATIVE_TESTS
**YES** — failed/incomplete provisioning stays off editor

### CROSS_TENANT_TEST
**YES** — foreign ref with other session withholds edit CTA

### REGRESSION_TEST
**YES** — dashboard `/hq` post-reg primary; Edit CTA on receipt secondary path

### DOCS_UPDATED
**YES** — `V2_04_BB_POST_REGISTRATION_DASHBOARD_FIX.md`

---

## BUG_ID: BB-POST-REG-DASHBOARD-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Auto-login via `establishBlessBoardSession` + `issueAuthenticatedSessionCookie` already ran after provision, but HTTP redirect used `buildRegistrationSuccessRedirect` → `/register-church/success?…` (website editor/success detour).

### FIX_PATHS
- `src/blessboard/http/apexMarketingRoutes.js` — post-commit redirect `303` → `/hq` (redirect-only; shared session unchanged)

### BEHAVIOR_NOW
Successful church registration → provision + roles + session cookie → **`/hq`** already authenticated. No second login. Success page retained for receipt/ref deep links only.

### EXPECTED_BEHAVIOR
Administrator lands on HQ dashboard for the newly provisioned church without visiting success/editor first.

### TEST_FILES
- `tests/v2-04-bb-post-registration-dashboard.test.js` (5) — A new user, B phone reuse, C role fail no session, D `/hq` gate, E tenant context
- Helper: `tests/helpers/blessboardRegistrationSuccess.js` → `assertChurchReadyHqRedirect`

### TEST_COUNT
**5**

### NEGATIVE_TESTS
**YES** — role/provision failure; unauthenticated `/hq`

### CROSS_TENANT_TEST
**YES** — reused identity loads new church context on `/hq`

### REGRESSION_TEST
**YES** — existing registration suites assert `/hq` Location via shared helper

### DOCS_UPDATED
**YES** — `V2_04_BB_POST_REGISTRATION_DASHBOARD_FIX.md`, this audit, coverage audit

### REMAINING_GAP
None for redirect/auto-login.

---

## BUG_ID: AC-REG-WEB-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Success `editPath` previously targeted Website Management Hub (`/app/settings/website`) instead of public edit path.

### FIX_PATHS
- `src/activeclinic/services/resolveActiveClinicRegistrationSuccessWebsite.js` — `editPath` via `buildPublicWebsiteEditPath`; `hubPath` retained separately
- Shared success presentation / AC panel CTA (`data-ac-build-website`)

### BEHAVIOR_NOW
Post-reg **Edit your website** → `/clinics/:clinicKey?website_edit=1&website_mode=draft`. Hub path preserved as management destination, not edit CTA.

### EXPECTED_BEHAVIOR
Canonical AC public-site edit mode with draft query flags; dynamic clinicKey; hub not used as edit landing.

### TEST_FILES
- `tests/activeclinic-ac-post-reg-editor-route.test.js` (4) — asserts path ≠ hub; edit mode; seeded content; distinct clinicKeys; cross-tenant deny; hub still reachable

### TEST_COUNT
**4**

### NEGATIVE_TESTS
**YES** — unauthorized / cross-tenant edit denied

### CROSS_TENANT_TEST
**YES**

### REGRESSION_TEST
**YES** — hub `/app/settings/website` still loads as management surface

### DOCS_UPDATED
**YES** — `V2_04_REGISTRATION_WEBSITE_EDITOR_BUG_AUDIT.md` (AC post-reg CLOSED)

### REMAINING_GAP
Hub chrome UX when visiting hub directly → tracked under **AC-WEB-EDITOR-01** (FIXED).

---

## BUG_ID: PLATFORM-PASSWORD-UX-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Shared `GpRegistrationPasswordRules` already existed. AC administrator step included `platform/partials/registration-password-rules` markup, but `GpRegistrationPasswordRules.init(...)` was nested under the clinic-step `else` (no `#password`). Admin step never initialized live rules. BB already initialized when `#register_password` exists.

### FIX_PATHS
- `views/activeclinic/public/register-clinic.ejs` — `GpRegistrationPasswordRules.init(...)` runs on the **administrator** step after the password form (guarded by `#password`), not under clinic `else`.
- Shared assets preserved (no AC-specific rules, no duplication):
  - `views/platform/partials/registration-password-rules.ejs`
  - `public/platform/registration-password-rules.js`
- BB `register-church.ejs` unchanged; still initializes shared component on admin password step.

### BEHAVIOR_NOW
AC administrator password step: live `.is-met` / `aria-checked` updates via shared component. BB administrator password step: same shared component, same length-only rules. Server validation unchanged (canonical min/max length only).

### EXPECTED_BEHAVIOR
While typing on AC or BB administrator password step, requirement markers update live using the same shared component; displayed rules match server policy.

### TEST_FILES
- `tests/platform-password-ux-01.test.js` — A–G focused suite (AC init, AC live `.is-met`, BB init, BB live `.is-met`, short password rejected, valid pair accepted, UI↔server rule alignment)

### TEST_COUNT
**7**

### NEGATIVE_TESTS
**YES** — short invalid password rejected on AC admin POST (400); over-max / mismatch on canonical pair validator

### CROSS_TENANT_TEST
**N/A** (public registration UX)

### REGRESSION_TEST
**YES** — BB parity init + live `.is-met`; shared client only evaluates `min_length` / `max_length`

### DOCS_UPDATED
**YES** — this audit + `V2_04_BUG_FIX_TEST_COVERAGE_AUDIT.md`

### REMAINING_GAP
None for stated defect.

---

## BUG_ID: AC-WEB-EDITOR-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** `/app/settings/website` mounted MW Studio-like chrome (`website-cms-nav` / `data-ac-mw-editor` / `ac-app-body--mw`) without WE01 public-edit canvas, producing a blank/dark “editor stage.” Canonical visual editor is `/clinics/:clinicKey?website_edit=1&website_mode=draft`.

### FIX_PATHS
- `views/activeclinic/app/settings-website-content.ejs` — management-only hub: identity, Draft/Published + unpublished count, management nav (Sections/Media/History), primary **Edit Website** CTA to canonical editor; **no** `website-cms-nav` / fake canvas
- `src/activeclinic/http/activeClinicSettingsRoutes.js` — hub `pageData` no longer sets `cmsNav` (so `ac-app-body--mw` does not apply on hub)
- `public/activeclinic/website-cms.css` — hub identity / manage-nav styles
- CMS sub-routes (Sections/Media/History/etc.) keep existing management chrome; WE01 remains only on public edit path
- Post-reg / edit destinations already pointed at public edit path (AC-REG-WEB-01)

### BEHAVIOR_NOW
Hub is a clear Website Management Hub inside normal app chrome. Edit Website opens `/clinics/:clinicKey?website_edit=1&website_mode=draft`. Preview uses canonical `website_mode=draft` preview. Publish gated by `canPublish`. Sections/Media/History links work. Cross-tenant editor access denied.

### EXPECTED_BEHAVIOR
Hub = management only. Visual editing only on canonical public edit path. No duplicate editor / empty dark workspace.

### TEST_FILES
- `tests/ac-web-editor-01-management-hub.test.js` (9) — A–J hub chrome, edit CTA, clinicKey, preview, unpublished count, publish auth, Sections/Media/History, cross-tenant
- Post-reg routing: `tests/activeclinic-ac-post-reg-editor-route.test.js` (4)

### TEST_COUNT
**9** focused hub closure + **4** post-reg

### NEGATIVE_TESTS
**YES** — publish without auth (cross-tenant 403); `canPublish:false` hides publishPath; cross-tenant editor denied

### CROSS_TENANT_TEST
**YES**

### REGRESSION_TEST
**YES** — hub markers require management role and forbid `data-ac-mw-editor` / editor canvas hosts

### DOCS_UPDATED
**YES** — this audit; inventory notes management vs editor

### REMAINING_GAP
None for stated hub UX defect. CMS sub-pages may still use Studio-like chrome with real content (not a blank canvas); out of hub scope.

---

## BUG_ID: AC-INITIAL-DIRTY-STATE-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** `coming_soon` provision seeded non-null drafts with `published_value=null` → Change Manager counted 63 `added` keys. Audit: `V2_04_AC_INITIAL_UNPUBLISHED_CHANGES_AUDIT.md`.

### FIX_PATHS
- `src/platform/website/provisionService.js` — `shouldAlignPublishedBaseline` defaults **true** (does not flip instance status to live)
- `src/platform/registration/initializeOrganizationWebsite.js` — uses align helper
- `src/activeclinic/website/provisionActiveClinicWebsite.js` — empty-instance reseed aligns
- `src/blessboard/website/blessboardEngineContentService.js` — `seedUnpublishedEngineContent` aligns baseline
- `src/platform/website/repairProvisionalPublishedBaseline.js` — dry-run-by-default repair (confirm required)

### BEHAVIOR_NOW
New AC/BB provisioned sites → unpublished count **0**; instance can remain `coming_soon`. Real edit → count > 0; publish → 0.

### EXPECTED_BEHAVIOR
`UNPUBLISHED_CHANGES=0` immediately after provision with no user edits; seed = baseline.

### TEST_FILES
- `tests/v2-04-initial-website-unpublished-count.test.js` (7) — AC=0, BB=0, edit/revert/publish, metadata noise, repair path, characterization of legacy 63

### TEST_COUNT
**7**

### NEGATIVE_TESTS
**YES** — characterization with `publishStarter: false` still yields 63; repair requires confirm

### CROSS_TENANT_TEST
**N/A** (count is instance-scoped; isolation covered by Change Manager foundation elsewhere)

### REGRESSION_TEST
**YES** — BB seed align; `v2-01-website-change-manager-foundation.test.js` still green (9/9 checked this pass)

### DOCS_UPDATED
**YES** — `V2_04_AC_INITIAL_UNPUBLISHED_CHANGES_AUDIT.md` (FIXED 2026-10-02)

### REMAINING_GAP
Optional **backfill** of pre-fix dirty provisional tenants via repair helper — **not** auto mass-update (requires explicit `confirm: true`).

---

## BUG_ID: AC-SEC-01

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Patient preferences UI previously implied success via `?saved=1` without durable store. Now EXISTING_STORE on `platform.communication_preferences`. Matrix: `ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md`.

### FIX_PATHS
- `src/activeclinic/http/activeClinicPatientPortalMissingRoutes.js` — ignores `?saved=1`; POST persists
- `views/activeclinic/patient/notifications.ejs` — authoritative markers; clinical consent informational only
- Store: existing `platform.communication_preferences` (no new consent engine)

### BEHAVIOR_NOW
Success only after real POST; DB rows verified; clinical consent not writable from portal; forged/cross-tenant denied.

### EXPECTED_BEHAVIOR
Patient communication preferences persist authoritatively; UI must not fake save; clinical consent remains staff-side.

### TEST_FILES
- `tests/activeclinic-ac-sec-01-preferences.test.js` (5) — asserts no fake `saved=1`, DB persist, reload, clinical consent untouched, unauth/cross-tenant

### TEST_COUNT
**5**

### NEGATIVE_TESTS
**YES** — unauth, forged POST, fake query success denied

### CROSS_TENANT_TEST
**YES**

### REGRESSION_TEST
**YES** — view mode markers; migration SQL presence for EXISTING_STORE

### DOCS_UPDATED
**YES** — gap matrix CLOSED / EXISTING_STORE

### REMAINING_GAP
None for stated scope (clinical consent remains staff ACN11 by design).

---

## BUG_ID: AC-SEC-02

### STATUS
**FIXED**

### ROOT_CAUSE_CONFIRMED
**YES.** Catalogue already omits clinical perms for `activeclinic_receptionist`; needed automated same-tenant HTTP denial proof (no accidental grant / body leak).

### FIX_PATHS
- RBAC catalogue (no reception clinical grant) — unchanged intentional DENIED
- Clinical encounter routes enforce permissions
- Proof suite: `tests/activeclinic-ac-sec-02-reception-clinical-notes.test.js`

### BEHAVIOR_NOW
Same-tenant receptionist GET/POST clinical encounter/notes → **403**; no note body leak; no mutation. Practitioner can access; nurse bounds preserved; cross-tenant/facility denied.

### EXPECTED_BEHAVIOR
Receptionist denied restricted clinical encounter notes with negative automated proof.

### TEST_FILES
- `tests/activeclinic-ac-sec-02-reception-clinical-notes.test.js` (5)

### TEST_COUNT
**5**

### NEGATIVE_TESTS
**YES** — core of the suite

### CROSS_TENANT_TEST
**YES** — cross-tenant + wrong-facility

### REGRESSION_TEST
**YES** — catalogue grant absence; clinician positive path for contrast

### DOCS_UPDATED
**YES** — gap matrix CLOSED / PROVEN

### REMAINING_GAP
None for stated defect.

---

## Shared vs product

| Locus | Bugs |
|-------|------|
| **Shared platform fix implemented** | REG-STATE-01, AC-INITIAL-DIRTY-STATE-01 |
| **Product-specific fix implemented** | BB-PROVISION-01, BB-REG-WEB-01, AC-REG-WEB-01, AC-WEB-EDITOR-01, AC-SEC-01, AC-SEC-02 |
| **Shared component; AC wiring fixed (BB already OK)** | PLATFORM-PASSWORD-UX-01 |

Shared modules touched by product CTA/baseline work (not double-counted as separate platform defects):  
`registrationSuccessPresentation.js`, `publicWebsiteUrl.js` / `buildPublicWebsiteEditPath`, Change Manager diff stack.

Where shared platform changed (REG-STATE-01, baseline align), BB+AC both consume the behavior; focused suites cover both products for draft state and unpublished count.

---

## Docs consulted (primary)

- `docs/qa/V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md`
- `docs/qa/V2_04_FINAL_GAP_AND_TEST_PLAN.md`
- `docs/qa/V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`
- `docs/qa/V2_04_BB_PROVISION_01_KNOWN_ISSUE.md`
- `docs/qa/V2_04_REGISTRATION_WEBSITE_EDITOR_BUG_AUDIT.md`
- `docs/qa/V2_04_AC_INITIAL_UNPUBLISHED_CHANGES_AUDIT.md`
- `docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md`
- `docs/qa/V2_04_P0_BURNDOWN.md`

---

## Footer

BUGS_AUDITED=9
FIXED=9
PARTIAL=0
OPEN=0
REGRESSED=0
SHARED_PLATFORM_FIXES=2
PRODUCT_SPECIFIC_FIXES=7
FINAL=V2_04_RECENT_BUG_FIX_AUDIT_COMPLETE
