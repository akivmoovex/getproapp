# V2.04 Final Engineering Defect Closure

**Candidate status:** frozen app candidate `7ae27d6631e6cd46332491d3b9315969aeb6f279` (`7ae27d6631e6`) — reconciled from previous `600d1c07cfea3b287455226ab50d623809fa2ea8` via DOC_ONLY tip commit. **READY for final blocker retest against hosted tip.** **Do not close RB-QA-01 / RB-QA-02** until that retest PASSes.  
**Preserved packs:** Real Responsive Editor Viewport (12/12), AC Catalogue GUI shell fix (10/10).

## TESTING DB migration gate (2026-10-02)

| Item | Result |
|------|--------|
| DATABASE_IDENTITY | `moovex-platform-v7` / `testing` |
| Pre-gate BB ledger tip | **118** |
| Post-gate BB ledger tip | **122** |
| Migration 119 | **APPLIED** this run (`119_member_number_church_id.sql`) |
| Migration 120 | **APPLIED** this run (`120_member_domain_v204.sql`) |
| Also applied (additive, pending) | platform `046`, `047`; BB `121`, `122` |
| MIGRATIONS_APPLIED_THIS_RUN | **6** |
| SAFE_TO_APPLY_BEFORE_APP_DEPLOY | **YES** (all additive; widens CHECKs / adds nullable cols + defaults; no destructive DROP of live data) |
| BB primary list SELECT (`member_number`, `portal_access_status`) | **works** — fallback not required |
| PRODUCTION | **UNTOUCHED** |
| App candidate SHA | **unchanged** `600d1c07…` (no code edits in migration gate) |

Verified columns on `blessboard.members` after apply: `member_number` (text, NULL), `portal_access_status` (text, NOT NULL, default `not_activated`), plus profile / portal / `platform_person_id` from 120. Index `members_church_member_number_uidx` present.

### Schema changes (from migration SQL + DB verify)

**119:** additive `members.member_number TEXT NULL`; length CHECK; unique index `(church_id, lower(trim(member_number)))` for live statuses.

**120:** widens `members_status_check`; additive `portal_access_status NOT NULL DEFAULT 'not_activated'` + CHECK; `platform_person_id` (+ optional FK/index); profile/address/next-of-kin/phone-pending columns; RBAC permissions `members.block` / `members.manage_church_id`; backfill portal status from `user_id`/`suspended`; rebuilds contact uniqueness indexes for expanded live statuses.



## Hosted tip one-commit reconciliation (2026-10-02)

| Item | Result |
|------|--------|
| PREVIOUS_CANDIDATE | `600d1c07cfea3b287455226ab50d623809fa2ea8` |
| HOSTED_SHA | `7ae27d6631e6` (`7ae27d6631e6cd46332491d3b9315969aeb6f279`) |
| PREVIOUS_IS_ANCESTOR | **YES** |
| INTERVENING_COMMITS | **1** (`7ae27d66 Ver 2.04 website fix`) |
| COMMIT_CLASS | **DOC_ONLY** |
| Files | `docs/qa/V2_04_FINAL_ENGINEERING_DEFECT_CLOSURE.md`, `docs/qa/V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md` only |
| APPLICATION_DELTA | **NO** (`src`/`views`/`public`/`db`/`package*.json` identical to previous) |
| REQUIRED_FIXES_PRESENT | **YES** |
| SAFE_TO_FREEZE_HOSTED_SHA | **YES** (CASE A) |
| NEW_APPLICATION_CANDIDATE | `7ae27d6631e6cd46332491d3b9315969aeb6f279` |
| REDEPLOY_REQUIRED | **NO** |

**Decision:** Freeze hosted tip as the V2.04 application candidate. Next step: rerun final blocker QA against `7ae27d6631e6` (exact-SHA gate should PASS).

## Post-deploy final blocker retest (2026-10-02) — STOPPED

| Item | Result |
|------|--------|
| Required hosted SHA | `600d1c07cfea3b287455226ab50d623809fa2ea8` |
| Actual Hub/AC/BB SHA | `7ae27d6631e6` (`7ae27d6631e6cd46332491d3b9315969aeb6f279`) |
| HOSTED_SHA_MATCH | **FAIL** |
| HOSTED_BRANCH_PARITY | **PASS** (V4) |
| Functional QA | **NOT RUN** (gate stop) |
| RB-QA-01 / RB-QA-02 | remain **OPEN** |
| TESTING migrations | unchanged this run (122 / pending 0) |
| PRODUCTION | **UNTOUCHED** |
| READY_FOR_HOSTED_DEPLOY (prior) | still valid for candidate tree; hosted tip is **not** exact requested SHA |

Note: `600d1c07` is an ancestor of hosted `7ae27d66`, but this retest pack required exact SHA match.

## Defect table

| DEFECT | ROOT_CAUSE | FILES_CHANGED | TESTS | STATUS | MANUAL_RETEST_REQUIRED |
|--------|------------|---------------|-------|--------|------------------------|
| AC Website Admin blank/disturbed pages | Shared Clinic Editor chrome: `ac-mw-editor` + `ac-mw-nav` flex collision hid/pushed content | `views/activeclinic/partials/website-cms-nav.ejs`, `public/activeclinic/website-cms.css` (preserved) + blank-page tests | `v2-04-ac-website-admin-blank-page.test.js`, catalogue shell tests | FIXED (shared root) | YES — hosted `/app/settings/website/*` |
| AC historical version preview blank | `renderActiveClinicHistorical` never built Stitch `websitePresentation` | `src/platform/website/governanceVersionPreview.js` | `v2-04-final-engineering-defect-pack.test.js` | FIXED | YES — `/clinics/{key}/website/versions/{id}` |
| BB Members 503 | List queries require `member_number` / `portal_access_status`; undefined column → swallowed LOOKUP_ERROR → 503 | `memberIdentityRepository.js` (retry without V2.04 cols), `memberRegistrationService.js` (log) | contract + members schema suite | FIXED in code; **TESTING schema now has 119–120** | YES — T-M02–T-M15 after app deploy |
| BB publish `not_ready` | Readiness ignored engine `contact.details.*`; checklist cascaded global `readyOk`; service_times ignored `layout_metadata.entries` | `churchWebsitePublishService.js`, `websitePublicationValidationService.js`, publish test setup | `blessboard-church-website-publish.test.js` | FIXED | YES — full BB lifecycle |
| AC public 403 Clinic unavailable | Content publish succeeded without guaranteeing `setClinicWebsiteAvailability` / ignored failure | `activeClinicWebsiteRoutes.js` | defect-pack contract + availability suite | FIXED | YES — AC SAVE→PUBLISH→PUBLIC VERIFY |

## Regression packs run (local)

| Pack | Result |
|------|--------|
| Real Responsive Editor Viewport | PASS (13 assertions / 12 labeled scenarios + wiring) |
| AC Catalogue GUI shell | PASS |
| AC blank-page matrix | PASS |
| Final defect-pack contracts | PASS |
| BlessBoard church website publish | PASS (5/5) |
| Post-migration BB DB / repo list smoke | PASS |
| Post-migration BB/AC login HTTP smoke | PASS (200) |

## Notes

- TESTING now has BB **119–122** + platform **046–047**. Fallback members query is **not** required on TESTING.
- Cells remain deferred per V2.04 decision (RB-QA-01).
- True-stale / RB-QA-04 / DISABLED_COUNTRY_POST not reopened.
- **App not deployed in this gate.** Hosted tip may still be older SHA until deploy of `600d1c07…`.
- RB-QA-01 / RB-QA-02 remain **OPEN** pending hosted manual retest after deploy.

## Candidate contents

1. Responsive iframe editor fix  
2. AC catalogue GUI fix  
3. AC blank admin route shared-shell fix + tests  
4. Historical version preview Stitch wiring  
5. BB Members 503 resilience + logging  
6. BB publish readiness alignment  
7. AC public go-live on publish  
8. Automated regression tests + this closure doc  
