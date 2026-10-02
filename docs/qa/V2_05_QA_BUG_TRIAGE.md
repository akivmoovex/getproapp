# V2.05 / V5 — QA Document Defect Sweep

**Branch:** `V5`  
**TESTED_BASELINE_SHA:** `751293ffaf72a1d964c54901c449aed221f8a69f` (QA01–QA09 sweep; 68 PASS / 0 FAIL on that baseline working tree)  
**INTEGRATED_V5_SHA:** `b27b61f0520ff0c094a8389e5683e15f5591f307` (QA10/11/12 product tip on V5; see tip commit message for docs/test evidence)  
**Scope:** Authoritative V2.05 QA defect register. QA01–QA09 are the original defect sweep; QA10–QA12 are manual QA findings added 2 Oct 2026. No V2.03/V2.04 historical pass results are used as proof of current behavior.

> Historical note: Do not treat the baseline 68-pass result as evidence against a later integrated SHA unless tests were re-run at that SHA.

## Triage table — fixes, partial fixes, open items

| ID | Product | Severity | Reproduced | Root Cause | Fix | Automated Coverage | Current Result | Manual QA Needed |
|---|---|---|---|---|---|---|---|---|
| QA01 | BB Website | P1 | No (by design) | Post-registration intentionally redirects to `/hq` via `assertChurchReadyHqRedirect`; V2.05 main-flow batch1 asserts HQ dashboard, not website editor. “Homepage” report is expectation mismatch vs product flow. | None (not a defect vs V2.05 intended flow) | `tests/v2-05-main-flow-batch1-post-auth-dashboard.test.js`, `tests/v2-05-qa-defect-sweep.test.js` | **NOT_A_BUG** / PASS | Optional: confirm copy/CTA after register points to Website vs HQ |
| QA02 | BB Website | P1 | Yes (code) | Soft-fill `usedPublicDemoFill` drove public template banner even when `websiteStatus === "published"`. | Gate banner with `showPublicTemplateBanner = usedPublicDemoFill && (isPreview \|\| status !== "published")` in `loadTenantPublicPageModel.js`; shell uses `showPublicTemplateBanner`. | `tests/v2-05-qa-defect-sweep.test.js` (+ website main-flow suites) | **FIXED** | Confirm published live site has no demo/template banner |
| QA03 | BB Website | P1 | Yes (code) | `.gp-we-media-field__btn input[type=file]` used `pointer-events:none` + 1×1 clip — broke mobile gallery/photo picker. | Full-label hit target in `website-media-field.css`; `accept="image/*…"` on structured/inline upload inputs. | `tests/v2-05-qa-defect-sweep.test.js` | **FIXED** | Device QA: iOS/Android pick image from library in website editor |
| QA04 | BB Website | P1 | Yes (prior) | Service Times `layout_metadata` omitted from publish snapshot → public still showed prior times. | Snapshot includes `layoutMetadata` / `service_times_v1` via publication + homeServiceTimes paths. | `tests/v2-05-bb-service-times-publish.test.js` | **FIXED** | Publish Service Times change and verify public homepage |
| QA05 | BB Platform | P2 | Partial | List failures mapped almost all non-FORBIDDEN statuses to **503** + identical “temporarily unavailable” copy (masks authz/scope). Historical schema 503 (missing cols) already mitigated + hosted cleared in V2.04 docs; not re-proven broken on V5 tip. | Differentiate **403** / **400** / **503** messages in `hqMembersAdminRoutes.js` + `branchRegistrationAdminRoutes.js`. | `tests/v2-05-qa-defect-sweep.test.js`; existing `v2-04-bb-m01*` / membership suites | **PARTIAL_FIX** (UX clarity); list-outage root if still seen needs hosted logs | Retest Add Member + HQ/Branch members list on hosted after deploy |
| QA06 | BB Platform | P2 | Yes (code) | Staff invite GET listed branches **without** `includeIds: true` while `staff-access-invite.ejs` binds `value="<%= b.id %>"` → empty UUID → `branch_required`. Roles invite UX also genericized branch errors. | `includeIds: true` on staff invite; humanize `branch_required` on staff + `/hq/roles` invite/assign. | `tests/v2-05-qa-defect-sweep.test.js`, `tests/v2-04-final-blocker-defect-pack.test.js` (add-member includeIds) | **FIXED** | Invite branch admin via Staff Access (placement=branch) |
| QA07 | BB Platform | P2 | Open / product gap | Public announcements require `published` (+ schedule window) **and** `public` audience; church site hides branch-only items. No public attendance surface. Stitch AN/attendance rows still PARTIAL; T-M09 NOT_RUN historically. | No safe product change in this sweep (workflow ambiguity, not a single code bug). | Existing announcement/attendance suites; no draft→public E2E | **OPEN** | Manual: draft → publish + public audience → public page; attendance admin only |
| QA08 | BB Platform | P2 | Open (coverage) | Regression/manual gaps: RB-QA-01 NOT_RUN scenarios, FR sanity matrix, mobile companions PARTIAL — not a single reproducible app bug. | No code change this sweep. | Wave3/security/member-portal suites exist but do not close NOT_RUN manual pack | **OPEN** | Run remaining members/security/mobile manual scenarios |
| QA09 | AC + BB | P2 | Covered by suite | Forgot/reset password recovery audited earlier on V5; enumeration-safe routes + product isolation. | Prior recovery work (passwordReset* + views) retained in working tree. | `tests/v2-05-password-recovery.test.js` | **FIXED** (suite green) | Spot-check AC + BB forgot → email/SMS path on hosted |
| QA10 | BB Website | P2 / Major | Yes (manual QA + code) | BB hero decorative scrim/copy overlay captured pointer events above shared editable-image pencil. Direct clicks failed; Edit Entire Section worked via programmatic `pencil.click()`. | `pointer-events:none` on `.bb-tp-hero__scrim` (+ editor overlay/media-plane hit-target rules in `website-inline-edit.css`); reuse existing WE01 field-editor/media flow. | `tests/v2-05-qa10-inline-image-upload.test.js`, `tests/v2-05-qa-defect-sweep.test.js` | **FIXED** | Spot-check desktop + mobile: direct image icon → file picker → draft → preview → publish |
| QA11 | BB Auth / Account | P2 / Major | Yes (manual QA + code) | Member/profile email change updated only `blessboard.members.email_*`; login/forgot-password read `blessboard.users.email_normalized`, so old email kept working. | Atomically sync linked `blessboard.users` login email in `updateMemberProfile` (duplicate rejection + verified_at clear); portal maps `email_in_use`. | `tests/v2-05-qa11-email-change-login-identity.test.js` (+ recovery/auth suites) | **FIXED** | Spot-check hosted: change email, sign out, new login OK / old denied / phone OK / forgot-password to new |
| QA12 | BB Website | P2 / Major | Yes (manual QA / screenshot) | Home “Full library” teaser came from soft-fill without a real `page_sections` row (`sermons_intro`), so sectionManifest/SectionManager had no section for editor chrome. | Soft stub participates as `sectionKey=sermons_intro` with canEdit/canHide; canRemove only for normal freeform types; draft apply materializes CMS row on publish/hide when stub lacked a row. | `tests/v2-05-qa12-sermons-intro-section-editability.test.js`, `tests/shared-website-section-lifecycle.test.js` | **FIXED** | Verify Full library section edit/hide on home at desktop + 390px; draft → preview → publish |

## New manual QA findings — 2 Oct 2026

### QA10 — Direct inline Public Website image upload does nothing
- **Bug type:** Functional / UI interaction
- **Feature:** Public Website — Image Upload
- **Severity:** P2 / Major
- **Observed:** Clicking the image-upload icon directly on the public website editor produces no response.
- **Control comparison:** **Edit Entire Section** can select and upload an image successfully.
- **Expected:** The direct inline image icon opens the operating-system file selector and completes the same supported upload flow.
- **Root cause:** BB hero decorative scrim/copy overlay captured pointer events above the shared editable-image pencil.
- **Fix:** `b27b61f0520ff0c094a8389e5683e15f5591f307` — `pointer-events:none` on `.bb-tp-hero__scrim` + editor media-plane hit-target rules; shared WE01 upload path unchanged.
- **Status:** **FIXED** (V5) — regression suite `tests/v2-05-qa10-inline-image-upload.test.js`.

### QA11 — Email change does not update login identity
- **Bug type:** Functional / Authentication identity consistency
- **Feature:** Account / registered email change
- **Severity:** P2 / Major
- **Observed:** The application confirms the new email was saved, but login with the new email is denied while the old email still authenticates.
- **Expected:** After a successful email change, the new email is the active login identifier and the old email is no longer accepted.
- **Fix:** `2a8906b69639235066d3bdb5da1e53ebb84045aa` — profile email change updates linked `blessboard.users` login identity atomically.
- **Status:** **FIXED** (V5) — regression suite `tests/v2-05-qa11-email-change-login-identity.test.js`.
- **Security QA note:** Also verify password recovery destination/identifier, duplicate-email rejection, active sessions, and tenant/product isolation after the fix.

### QA12 — Public-page section lacks edit/remove tools
- **Bug type:** Functional / Website editor UI
- **Feature:** Public Website — section editing (`sermons_intro` / “Full library”)
- **Severity:** P2 / Major
- **Observed:** The section immediately above the sermon/banner card, shown as **“Full library”** in the QA screenshot, has no usable edit or remove controls.
- **Expected:** Every user-manageable public section should expose the approved editing affordance and, where the product permits it, hide/remove controls, with changes flowing through draft → preview → publish.
- **Root cause:** Soft-fill teaser had no `page_sections` row, so sectionManifest could not attach editor chrome.
- **Fix:** `15cba0be38aa9cbaadc9ceedd0e5d1d848b4882e` — soft stub as `sermons_intro` (canEdit/canHide; canRemove only for freeform); publish/hide materializes CMS row when needed.
- **Status:** **FIXED** (V5) — regression suite `tests/v2-05-qa12-sermons-intro-section-editability.test.js`.

## Website main-flow suite (QA01–QA04)

Executed against **TESTED_BASELINE_SHA** `751293ff…` working tree (pre-remote-integration sweep):

```text
NODE_ENV=test node --test \
  tests/v2-05-qa-defect-sweep.test.js \
  tests/v2-05-bb-service-times-publish.test.js \
  tests/v2-05-password-recovery.test.js \
  tests/v2-05-main-flow-batch1-post-auth-dashboard.test.js \
  tests/v2-05-main-flow-batch3-website-management.test.js \
  tests/v2-05-main-flow-batch4-website-content-editing.test.js \
  tests/v2-05-main-flow-batch5-publish-nudge.test.js \
  tests/v2-05-main-flow-batch6-unified-publish-workflow.test.js
```

**Baseline Result:** `68` pass / `0` fail (suites: defect-sweep contracts, Service Times publish, password recovery, main-flow batches 1/3/4/5/6).

## Integration metadata (post-rebase)

| Field | Value |
|---|---|
| BRANCH | V5 |
| TESTED_BASELINE_SHA | `751293ffaf72a1d964c54901c449aed221f8a69f` |
| QA10_FIX_SHA | `b27b61f0520ff0c094a8389e5683e15f5591f307` |
| QA11_FIX_SHA | `2a8906b69639235066d3bdb5da1e53ebb84045aa` |
| QA12_FIX_SHA | `15cba0be38aa9cbaadc9ceedd0e5d1d848b4882e` |
| INTEGRATED_V5_SHA | V5 tip after `fix(v2.05): close QA10 QA11 QA12 website and identity defects` (product fixes @ `b27b61f0` / `2a8906b6` / `15cba0be`) |
| INTEGRATED_TEST_SHA | product tip `b27b61f0520ff0c094a8389e5683e15f5591f307` + local docs/test-retarget (136 focused / 75 main-flow pass) |
| INTEGRATED_TEST_RESULT | Focused QA10/11/12 pack: `136` pass / `0` fail; V2.05 main-flow batch/task pack: `75` pass / `0` fail |

## Key files touched this sweep

- `src/blessboard/http/loadTenantPublicPageModel.js` — QA02 banner gate  
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs` — QA02  
- `public/platform/website-media-field.css`, `website-inline-edit.js/.css`, `public/blessboard/v5/website-structured-edit.js` — QA03  
- Service Times publish path (prior) — QA04  
- `hqMembersAdminRoutes.js`, `branchRegistrationAdminRoutes.js` — QA05 messaging  
- `hqStaffAccessRoutes.js`, `hqRoleAdminRoutes.js` — QA06  
- Password recovery services/routes/views — QA09 (prior)  
- `tests/v2-05-qa-defect-sweep.test.js` — contracts  

## P1 / P2 summary

- **P1 blockers remaining:** none from QA01–QA04 after fixes (QA01 not a bug). Device retest still required for QA03.  
- **P2 open:** QA07 (visibility/workflow), QA08 (manual/regression gaps). QA05 remains a partial fix pending hosted confirmation if 503 persists after schema deploy. QA10 (inline image hit target), QA11 (email login identity), and QA12 (`sermons_intro` editability) are **FIXED**.


## Current QA status snapshot

| Category | IDs |
|---|---|
| **FIXED** | QA02, QA03, QA04, QA06, QA09, QA10, QA11, QA12 |
| **PARTIAL_FIX / hosted confirmation** | QA05 |
| **OPEN** | QA07, QA08 |
| **NOT_A_BUG** | QA01 |

**Release note:** QA10–QA12 fixes and dedicated regression suites are integrated on V5; hosted spot-checks remain for image click, email-change login, and sermons_intro section chrome.
