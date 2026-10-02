# V2.05 / V5 — QA Document Defect Sweep

**Branch:** `V5`  
**TESTED_BASELINE_SHA:** `751293ffaf72a1d964c54901c449aed221f8a69f` (QA01–QA09 sweep; 68 PASS / 0 FAIL on that baseline working tree)  
**INTEGRATED_V5_SHA:** `8d859e11906ff58e363f143b0ee26f10053acf9e`  
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
| QA10 | BB Website | P2 / Major | Yes (manual QA) | Inline Public Website image-upload control is visible but does not respond to click. The same image can be selected/uploaded when entering **Edit Entire Section**, so the failure is isolated to the direct/inline media interaction path rather than upload storage itself. | **OPEN — no fix recorded yet.** Inspect inline media control event binding, overlay/z-index/pointer target, hidden file-input association, and parity with the working Edit Entire Section media field. | No dedicated regression test recorded yet. Add browser/DOM contract coverage for direct inline image control opening the file input and retaining existing Edit Entire Section behavior. | **OPEN** | Reproduce on desktop and mobile; click the direct image icon, select a local image, save draft, preview, publish, and verify public image. |
| QA11 | BB Auth / Account | P2 / Major | Yes (manual QA) | User email change reports success and the new email is stored/displayed, but authentication identity remains bound to the old email: new email login is denied while old email login still succeeds. This indicates profile/contact email update and login-identity credential update are not synchronized, or the wrong email field is being updated. | **OPEN — no fix recorded yet.** Trace email-change write path versus auth identity/user credential record; define whether email change must atomically update the login identifier, enforce uniqueness, invalidate stale identifier/session state as appropriate, and preserve audit/security controls. | No dedicated V2.05 regression test recorded yet. Add tests proving: new email can log in after successful change; old email can no longer log in; duplicate email is rejected; product/tenant isolation remains intact. | **OPEN** | Change email on hosted V5, sign out fully, test new email login, test old email rejection, password recovery to new email, and duplicate-email handling. |
| QA12 | BB Website | P2 / Major | Yes (manual QA / screenshot) | A section immediately above the sermon/banner content (shown as **“Full library”** in the supplied QA screenshot) has no visible section editing/removal controls. The surrounding website editor exposes edit controls, but this section cannot be edited or removed from the public-page editing flow. | **OPEN — no fix recorded yet.** Identify the section key/type and ensure it participates in the same editability contract as other public-page sections: edit control, section settings/content editing where applicable, remove/hide action where product rules allow, permissions, draft persistence, preview, and publish. | No dedicated regression test recorded yet. Extend website-editor section-contract coverage to assert editable/removable controls for this section and public output after draft/publish. | **OPEN** | Verify on the affected Sermons/Public Website page at desktop and 390px: edit text/content, hide/remove section if supported, save draft, preview, publish, and confirm live page. |

## New manual QA findings — 2 Oct 2026

### QA10 — Direct inline Public Website image upload does nothing
- **Bug type:** Functional / UI interaction
- **Feature:** Public Website — Image Upload
- **Severity:** P2 / Major
- **Observed:** Clicking the image-upload icon directly on the public website editor produces no response.
- **Control comparison:** **Edit Entire Section** can select and upload an image successfully.
- **Expected:** The direct inline image icon opens the operating-system file selector and completes the same supported upload flow.
- **Status:** **OPEN**

### QA11 — Email change does not update login identity
- **Bug type:** Functional / Authentication identity consistency
- **Feature:** Account / registered email change
- **Severity:** P2 / Major
- **Observed:** The application confirms the new email was saved, but login with the new email is denied while the old email still authenticates.
- **Expected:** After a successful email change, the new email is the active login identifier and the old email is no longer accepted.
- **Status:** **OPEN**
- **Security QA note:** Also verify password recovery destination/identifier, duplicate-email rejection, active sessions, and tenant/product isolation after the fix.

### QA12 — Public-page section lacks edit/remove tools
- **Bug type:** Functional / Website editor UI
- **Feature:** Public Website — section editing
- **Severity:** P2 / Major
- **Observed:** The section immediately above the sermon/banner card, shown as **“Full library”** in the QA screenshot, has no usable edit or remove controls.
- **Expected:** Every user-manageable public section should expose the approved editing affordance and, where the product permits it, hide/remove controls, with changes flowing through draft → preview → publish.
- **Status:** **OPEN**

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
| INTEGRATED_V5_SHA | `8d859e11906ff58e363f143b0ee26f10053acf9e` (local V2.05 commit rebased onto `origin/V5` @ `9bed844d`) |
| INTEGRATED_TEST_SHA | `aeb1c49036c97d7aa3a1346049abec6a5c0b1af2` |
| INTEGRATED_TEST_RESULT | `52` pass / `0` fail — focused: `v2-05-bb-service-times-publish`, `v2-05-password-recovery`, `v2-05-qa-defect-sweep`, `v2-05-main-flow-batch4`, `blessboard-home-service-times`, `v8-shared-auth-password-security` |

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
- **P2 open:** QA07 (visibility/workflow), QA08 (manual/regression gaps), QA10 (direct inline image upload), QA11 (email-change login identity), QA12 (section edit/remove controls). QA05 remains a partial fix pending hosted confirmation if 503 persists after schema deploy.


## Current QA status snapshot

| Category | IDs |
|---|---|
| **FIXED** | QA02, QA03, QA04, QA06, QA09 |
| **PARTIAL_FIX / hosted confirmation** | QA05 |
| **OPEN** | QA07, QA08, QA10, QA11, QA12 |
| **NOT_A_BUG** | QA01 |

**Release note:** The previously recorded automated results do not prove QA10–QA12 because these are newly reported manual findings and dedicated regression coverage has not yet been added.
