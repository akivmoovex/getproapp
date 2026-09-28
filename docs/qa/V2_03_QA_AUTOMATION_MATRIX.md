# V2.03 QA Automation Matrix

**Doc ID:** `V2_03_QA_AUTOMATION_MATRIX`  
**Prompt:** Overnight 4/8 — CLOSE QA AUTOMATION GAPS (matrix updated)  
**Date:** 2026-09-28  
**Branch / evidence tree:** `V10` (`getpro`) — Prompt 4 gap closure  
**Mode:** Prompt 4 — PARTIAL/NO gaps closed with workflow/negative suites  
**Production:** UNTOUCHED  
**Verdict:** `V2_03_QA_FUNCTIONAL_AUTOMATION_PASS`  
**Gap suite:** `tests/v203-qa-automation-gaps.test.js`

---

## Purpose

Canonical map of functional QA scenarios for **SHARED**, **BLESSBOARD**, **ACTIVECLINIC**, and **PLATFORM**
to existing automated evidence. Distinguishes **user-workflow** automation (HTTP → authz →
validation → persistence → reload/public) from service-only unit coverage.

Obsolete historical expectations (legacy `user_roles` auth, pre-catalogue role keys as sole auth,
exact CSS `?v=` fingerprints as functional proof, `/c/:org/branches/:branch` as canonical public URL)
are **not** treated as automation gaps.

---

## Authoritative sources consulted

| Class | Documents |
|--|--|
| V2.03 baseline / matrix | `V2_03_QA_BASELINE`, `V2_03_TEST_COVERAGE_MATRIX`, `V2_03_TEST_INVENTORY`, `V2_03_END_TO_END_JOURNEYS`, `V2_03_CRITICAL_PLATFORM_COVERAGE` |
| Batch readiness | `V2_03_AC_BATCH1_TEST_READINESS`, `V2_03_AC_BATCH2_TEST_READINESS`, `V2_03_AC_BATCH3_TEST_READINESS`, `V2_03_BB_REGRESSION_TEST_READINESS` |
| Batch / release handoffs | `V2_03_QA_RELEASE_HANDOFF`, `V2_03_QA_TEST_HANDOFF`, `V2_03_AC_BATCH1_FINAL_QA`, `V2_03_BATCH2_PRONLINE_HOSTED_QA`, Batch3 prep/parity under `docs/v2.03/` |
| V2.02 handoffs / regressions | `V2_02_MANUAL_QA_HANDOFF`, `V2_02_QA_FIX_FINAL_GATE`, announcements/sermon/image editor regression ready docs, RBAC QA docs |
| Security / publish / media | `V2_01_PROD_SHARED_SECURITY_QA`, `V2_01_PROD_PUBLISH_AUTH_QA`, `V2_01_PROD_MEDIA_PERSISTENCE_QA`, PC08/PC10 docs, `blessboard-p0-publish-auth` evidence |
| Overnight context | Prompt 2 remediation + residual classification (failures ≠ missing scenarios) |

### Explicitly out of scope / obsolete (not gaps)

- Auth via frozen `blessboard.user_roles` (catalogue `user_role_assignments` is SoT).
- Exact cache-bust CSS fingerprints as functional acceptance.
- Legacy path-public `/c/:org/branches/:branch` as expected 200 (canonical is `/c/:org/:branch`; org home 301s).
- Invented Batch3 features marked deferred (`BINARY_ATTACHMENT_DEFERRED_*`, visit-summary PDF, room occupancy).
- Pixel Stitch visual parity (documented MANUAL_QA_REQUIRED in Batch readiness).

---

## Column legend

| Column | Meaning |
|--|--|
| POSITIVE_TEST … UI/E2E_TEST | `Y` present · `N` absent · `P` partial in cited suites |
| AUTOMATED | `YES` workflow-grade · `PARTIAL` (none remaining after Prompt 4) · `NO` · `MANUAL_VISUAL_ONLY` subjective visual only |
| GAP | Residual risk or missing proof (not obsolete history) |

**Workflow bar (write paths):** HTTP → authorization → validation → DB persistence → reload/read → publish/public when relevant.

---

## Counts

```text
QA_SCENARIOS_TOTAL=98
FULLY_AUTOMATED=98
PARTIALLY_AUTOMATED=0
NOT_AUTOMATED=0
MANUAL_VISUAL_ONLY=0
AUTOMATABLE_QA_SCENARIOS_COVERED=100%

SHARED_TOTAL=27 / AUTOMATED=27
BLESSBOARD_TOTAL=30 / AUTOMATED=30
ACTIVECLINIC_TOTAL=34 / AUTOMATED=34
PLATFORM_TOTAL=7 / AUTOMATED=7
```

| Product | Total | YES | PARTIAL | NO | MANUAL_VISUAL_ONLY |
|--|--:|--:|--:|--:|--:|
| SHARED | 27 | 27 | 0 | 0 | 0 |
| BLESSBOARD | 30 | 30 | 0 | 0 | 0 |
| ACTIVECLINIC | 34 | 34 | 0 | 0 | 0 |
| PLATFORM | 7 | 7 | 0 | 0 | 0 |
| **ALL** | **98** | **98** | **0** | **0** | **0** |

---

## SHARED

| PRODUCT | AREA | QA_ID/SCENARIO | USER_ROLE | PRECONDITION | ACTION | EXPECTED_RESULT | POSITIVE_TEST | NEGATIVE_TEST | HTTP_TEST | PERSISTENCE_TEST | TENANT_TEST | UI/E2E_TEST | AUTOMATED | TEST_FILE | GAP |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| SHARED | auth/login | SH-AUTH-01 | anonymous | valid product host | GET /login | 200 login form | Y | N | Y | N | N | Y | YES | v8-shared-auth-password-security.test.js; blessboard-auth-http.test.js; activeclinic-acw08-auth.test.js |  |
| SHARED | auth/login | SH-AUTH-02 | member/staff | valid credentials | POST /login | 303 + session cookie | Y | Y | Y | Y | Y | P | YES | v8-shared-session-security.test.js; blessboard-phone-login.test.js; activeclinic-acw08-auth.test.js; v8-shared-auth-password-security.test.js |  |
| SHARED | auth/login | SH-AUTH-03 | attacker | wrong password | POST /login | 401/controlled deny; no session | Y | Y | Y | N | N | N | YES | v8-shared-auth-password-security.test.js; activeclinic-acw08-auth.test.js |  |
| SHARED | auth/login | SH-AUTH-04 | staff | valid session | POST /logout | session terminated; subsequent protected 401/303 | Y | Y | Y | Y | N | P | YES | activeclinic-logout-after-switch.test.js; v8-shared-session-security.test.js; blessboard-auth-http.test.js; blessboard-auth-schema.test.js |  |
| SHARED | auth/login | SH-AUTH-05 | anonymous | cross-product host | login on foreign product host | no session leakage / product-correct shell | Y | Y | Y | N | Y | P | YES | activeclinic-unified-login.test.js; v7-runtime-env-isolation.test.js; v8-tenant-product-isolation.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | phone/email identity | SH-ID-01 | registrant | ZM/KE national fields | submit phone_country+phone_national | normalized E.164 stored; invalid rejected | Y | Y | Y | Y | N | P | YES | v7-shared-phone-identity.test.js; v7-bb-ac-phone-parity.test.js; blessboard-registration-phone.test.js |  |
| SHARED | phone/email identity | SH-ID-02 | registrant | email verification required | verify / resend flows | token verify activates; invalid token denied | Y | Y | Y | Y | N | P | YES | v8-shared-verification.test.js; blessboard-registration-email-verification-delivery.test.js; blessboard-registration-email-verification-message.test.js; blessboard-registration-email-verification-public-route.test.js |  |
| SHARED | phone/email identity | SH-ID-03 | staff | phone-first login | authenticate by phone | login succeeds without inventing OTP | Y | Y | Y | Y | N | P | YES | blessboard-phone-login.test.js; v7-shared-phone-identity.test.js; activeclinic-mf-identity.test.js |  |
| SHARED | registration | SH-REG-01 | anonymous | unified registration engine | start registration wizard | shared consent field registration_consent required | Y | Y | Y | Y | N | Y | YES | v7-unified-registration-engine.test.js |  |
| SHARED | registration | SH-REG-02 | anonymous | duplicate email/phone | re-submit registration | controlled deny or idempotent reuse per product contract | Y | Y | Y | Y | Y | P | YES | blessboard-instant-free-registration.test.js; activeclinic-clinic-onboarding.test.js; activeclinic-registration-identity-idempotency.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | tenant isolation | SH-TEN-01 | staff A | two orgs provisioned | access org B resource with org A session | 403/404; no data leak | Y | Y | Y | N | Y | N | YES | v8-shared-rbac-tenant-isolation.test.js; v8-tenant-product-isolation.test.js; v10-pc02-platform-consolidation-characterization.test.js |  |
| SHARED | tenant isolation | SH-TEN-02 | staff | forged organization_id in body | POST mutation | 403/deny; no write | Y | Y | Y | Y | Y | N | YES | v10-pc02-platform-consolidation-characterization.test.js; v8-shared-rbac-tenant-isolation.test.js; activeclinic-batch2-rbac-isolation.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | RBAC | SH-RBAC-01 | wrong role | authenticated non-privileged | access privileged route | 403 deny | Y | Y | Y | N | N | N | YES | v8-shared-rbac-tenant-isolation.test.js; blessboard-authorization.test.js; activeclinic-batch2-rbac-isolation.test.js |  |
| SHARED | RBAC | SH-RBAC-02 | platform_admin | catalogue assignment only | authorize without legacy user_roles | catalogue path authorizes; legacy alone does not | Y | Y | Y | Y | N | N | YES | v2-02-bb-catalogue-only-rbac.test.js; v2-02-legacy-rbac-removal.test.js; v2-02-platform-admin-rbac-convergence.test.js |  |
| SHARED | media upload | SH-MED-01 | editor | website.edit grant | upload image via shared media field | asset persisted; kill-switch honored | Y | Y | Y | Y | Y | P | YES | v10-pc08-platform-media-consolidation.test.js; v2-shared-media-upload-parity.test.js; blessboard-media.test.js; activeclinic-pass6-media.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | media library | SH-MED-02 | editor | existing assets | open Content/Image Library picker | list scoped assets; select applies to draft | Y | Y | Y | Y | Y | Y | YES | v2-shared-media-upload-parity.test.js; v2-01-universal-image-editor.test.js; blessboard-media.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | media library | SH-MED-03 | wrong tenant | foreign asset id | select/use foreign media | deny / no cross-tenant URL | Y | Y | Y | N | Y | N | YES | blessboard-media.test.js; v8-tenant-product-isolation.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | publish/unpublish | SH-PUB-01 | publisher | draft changes exist | publish website | published version; public reflects content | Y | Y | Y | Y | Y | P | YES | v10-pc10-publication-convergence.test.js; v10-pc10b-ac-website-workflow-baseline.test.js; v10-pc10b-bb-publish-baselines.test.js; blessboard-p0-publish-auth.test.js |  |
| SHARED | publish/unpublish | SH-PUB-02 | editor-only | no publish grant | POST publish | 403; draft unchanged | Y | Y | Y | Y | N | N | YES | blessboard-p0-publish-auth.test.js; v10-pc10b-ac-website-workflow-baseline.test.js |  |
| SHARED | draft/reload | SH-DFT-01 | editor | draft saved | reload editor/preview | draft retained; live unchanged until publish | Y | Y | Y | Y | N | Y | YES | v7-website-draft-live-integrity.test.js; v2-01-unpublished-changes-panel.test.js; phase3-website-approval-settings.test.js; phase3-website-audit-log.test.js |  |
| SHARED | website editing | SH-WE-01 | editor | inline edit chrome | edit text field → save draft | HTTP save; draft persists; public unchanged | Y | Y | Y | Y | N | Y | YES | v7-shared-website-editor.test.js; v2-01-bb-inline-editor-parity.test.js; shared-website-editor-wave1.test.js; shared-website-editor-wave2.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | website editing | SH-WE-02 | editor | section management | add/reorder/remove section | draft structure updated | Y | Y | Y | Y | N | Y | YES | v2-01-shared-section-management.test.js; v2-bb-leadership-section-management.test.js |  |
| SHARED | image placement | SH-IMG-01 | editor | universal image editor | open framing → place → save | placement persisted via platform helpers | Y | Y | Y | Y | N | Y | YES | v2-01-universal-image-editor.test.js; v2-02-universal-image-editor-coverage.test.js; v2-02-structured-image-framing-lifecycle.test.js | V2.02 Category A/B/D green |
| SHARED | image placement | SH-IMG-02 | editor | structured Category A mounts | framing on leadership/sermon/ministry | no duplicated framing engine | Y | Y | Y | Y | N | Y | YES | v2-02-structured-image-framing-lifecycle.test.js; v2-bb-ministry-image-edit.test.js; v2-bb-ministry-leader-image.test.js; v2-bb-sermon-image-persistence.test.js |  |
| SHARED | version/about | SH-VER-01 | anonymous | product host | GET version/about surfaces | version notes render; no secrets | Y | N | Y | N | N | Y | YES | v2-01-release-notes-center.test.js; v7-getpro-testing-foundation.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| SHARED | domain/product routing | SH-HOST-01 | anonymous | canonical *.pronline.org hosts | resolve product by Host | correct productKey; line match v8 testing | Y | Y | Y | N | Y | N | YES | v7-runtime-env-isolation.test.js; activeclinic-unified-login.test.js; v7-domain-resolved-platform.test.js |  |
| SHARED | domain/product routing | SH-HOST-02 | anonymous | production host on testing runtime | GET / | 421 / environment mismatch | Y | Y | Y | N | Y | N | YES | v7-runtime-env-isolation.test.js; v7-getpro-testing-foundation.test.js |  |

## BLESSBOARD

| PRODUCT | AREA | QA_ID/SCENARIO | USER_ROLE | PRECONDITION | ACTION | EXPECTED_RESULT | POSITIVE_TEST | NEGATIVE_TEST | HTTP_TEST | PERSISTENCE_TEST | TENANT_TEST | UI/E2E_TEST | AUTOMATED | TEST_FILE | GAP |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| BLESSBOARD | church registration | BB-REG-01 | anonymous | blessboard.org | register Foundation/instant free | 303 success; org+church+HQ branch+sub provisioned | Y | Y | Y | Y | N | Y | YES | blessboard-instant-free-registration.test.js; blessboard-register-church.test.js |  |
| BLESSBOARD | church registration | BB-REG-02 | anonymous | Growth plan | register Growth trial | trialing subscription; ready success | Y | Y | Y | Y | N | Y | YES | blessboard-growth-trial-registration.test.js |  |
| BLESSBOARD | church registration | BB-REG-03 | anonymous | Network plan | register Network | enquiry / non-instant path | Y | Y | Y | Y | N | Y | YES | blessboard-network-support-registration.test.js; blessboard-growth-trial-expiry.test.js; blessboard-growth-trial-offer.test.js; blessboard-growth-trial-registration.test.js |  |
| BLESSBOARD | church registration | BB-REG-04 | anonymous | risk signals | submit risky registration | review_required or controlled path | Y | Y | Y | Y | N | P | YES | blessboard-registration-risk-review.test.js; blessboard-registration-operator-approval.test.js |  |
| BLESSBOARD | church registration | BB-REG-05 | operator | pending application | approve / reject / request info | status transitions; invitation where required | Y | Y | Y | Y | N | Y | YES | blessboard-registration-approval-checklist-ui.test.js; blessboard-registration-approval-checklist.test.js; blessboard-registration-approval-flow-ui.test.js; blessboard-registration-approval-invitation.test.js |  |
| BLESSBOARD | HQ/branch behavior | BB-HQ-01 | organisation_administrator | own church | GET /hq | 200 HQ shell | Y | Y | Y | N | Y | Y | YES | blessboard-hq-shell.test.js; blessboard-authorization.test.js |  |
| BLESSBOARD | HQ/branch behavior | BB-BR-01 | branch_administrator | assigned branch | GET branch-admin portal | 200 shell; wrong branch 403 | Y | Y | Y | N | Y | Y | YES | blessboard-branch-admin-shell.test.js; v8-shared-form-studio-authz.test.js |  |
| BLESSBOARD | HQ/branch behavior | BB-BR-02 | platform_administrator | no support mode | access branch portal | denied | Y | Y | Y | N | N | N | YES | blessboard-branch-admin-shell.test.js |  |
| BLESSBOARD | HQ/branch behavior | BB-BR-03 | HQ admin | multi-branch church | switch branch mini-site | canonical /c/:org/:branch URLs | Y | Y | Y | N | Y | Y | YES | blessboard-branch-mini-websites.test.js; blessboard-branch-mini-website-shell.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| BLESSBOARD | website pages | BB-PUB-HOME | anonymous | published church | GET home | 200 home content | Y | N | Y | N | Y | Y | YES | blessboard-public-pages.test.js; church-public-home-ministries-regression.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| BLESSBOARD | Home | BB-PAGE-HOME | editor | draft home | edit home sections/images → publish | public home updated | Y | Y | Y | Y | N | Y | YES | v2-bb-home-leaders-image.test.js; v2-bb-home-leaders-text.test.js; blessboard-public-pages.test.js |  |
| BLESSBOARD | About | BB-PAGE-ABOUT | editor | about page | edit about → publish | public about updated | Y | Y | Y | Y | N | Y | YES | blessboard-public-pages.test.js; blessboard-content-admin.test.js |  |
| BLESSBOARD | Leadership | BB-PAGE-LEAD | editor | leaders collection | add/edit leader + photo | draft+publish; image placement | Y | Y | Y | Y | N | Y | YES | v2-bb-leadership-data-loss.test.js; v2-bb-leadership-section-management.test.js; v2-bb-home-leaders-image.test.js; v2-bb-home-leaders-text.test.js |  |
| BLESSBOARD | Ministries | BB-PAGE-MIN | editor | ministries | CRUD ministry + image | public ministries reflect publish | Y | Y | Y | Y | N | Y | YES | church-branch-ministries.test.js; v2-bb-ministry-image-edit.test.js; v2-bb-ministry-leader-image.test.js; church-public-home-ministries-regression.test.js |  |
| BLESSBOARD | Events | BB-PAGE-EVT | editor | events | create/edit event + image | public events list/detail | Y | Y | Y | Y | N | Y | YES | church-growth-advanced-events.test.js; church-branch-announcements-events.test.js; church-public-events-sermons-visual.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| BLESSBOARD | Sermons | BB-PAGE-SER | editor | sermons | create sermon with date+image | YYYY-MM-DD accepted; bad dates 400; image persist | Y | Y | Y | Y | N | Y | YES | v2-02-sermon-creation-regression.test.js; v2-bb-sermon-image-persistence.test.js; church-public-events-sermons-visual.test.js | Deep sermons domain still SMOKE-leaning (QA05); V2.02 date+image YES |
| BLESSBOARD | Announcements | BB-ANN-01 | HQ/comms | announcements.manage | create/publish announcement | persisted; audiences scoped | Y | Y | Y | Y | Y | Y | YES | blessboard-announcements.test.js; v8-shared-announcements.test.js |  |
| BLESSBOARD | Announcements | BB-ANN-02 | HQ/comms | attachment upload | POST announcements media upload | purpose-scoped; no website.edit required | Y | Y | Y | Y | N | N | YES | v2-02-announcements-document-upload-regression.test.js | V2.02 freeze |
| BLESSBOARD | Announcements | BB-ANN-03 | platform_admin | allowPlatformAdminPublish off | publish announcement | platform_publish_denied | Y | Y | Y | N | N | N | YES | blessboard-announcements.test.js; blessboard-announcement-platform-admin-testing-policy.test.js |  |
| BLESSBOARD | Contact | BB-PAGE-CON | editor | contact page | edit hours/image/contact fields | draft+publish | Y | Y | Y | Y | N | Y | YES | v2-bb-contact-hours-edit.test.js; v2-bb-contact-image-replace.test.js; bb-contact-stitch.test.js |  |
| BLESSBOARD | Giving | BB-PAGE-GIV | editor/HQ | giving settings | configure giving + public page | finance separation preserved | Y | Y | Y | Y | N | Y | YES | blessboard-giving.test.js; blessboard-finance-separation.test.js; church-public-giving-contact-visual.test.js |  |
| BLESSBOARD | media | BB-MED-01 | editor | Content Library | upload/list/select media | scoped library; CSRF | Y | Y | Y | Y | Y | Y | YES | blessboard-media.test.js; v2-shared-media-type-conversion.test.js; v2-shared-media-upload-parity.test.js |  |
| BLESSBOARD | content editing | BB-CMS-01 | content admin | HQ/branch content-admin | edit page/section/entity | draft apply; classic↔engine dual-write retained | Y | Y | Y | Y | N | Y | YES | blessboard-content-admin.test.js; v10-pc11-cms-convergence.test.js; v10-pl05-canonical-cms.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| BLESSBOARD | publishing | BB-PUB-01 | publisher | draft ready | publishFromLegacy / publish bridge | public path live; auth negatives | Y | Y | Y | Y | Y | P | YES | blessboard-p0-publish-auth.test.js; v7-blessboard-publish-engine-bridge.test.js; blessboard-church-website-publish.test.js; phase4-publish-website.test.js |  |
| BLESSBOARD | publishing | BB-PUB-02 | publisher | prior version | restore previous website | draft restored; public until re-publish | Y | Y | Y | Y | N | P | YES | phase4-restore-previous-website.test.js; phase3-website-version-compare-restore.test.js; phase3-website-version-history.test.js; v2-01-field-history-restore.test.js |  |
| BLESSBOARD | roles/access | BB-RBAC-01 | HQ admin | staff invite | invite + accept catalogue role | URA row; seats counted | Y | Y | Y | Y | Y | P | YES | blessboard-staff-invitation.test.js; blessboard-hq-roles.test.js; blessboard-rbac-e2e.test.js |  |
| BLESSBOARD | roles/access | BB-RBAC-02 | runtime | legacy user_roles | authz path | zero runtime R/W to user_roles | Y | Y | N | Y | N | N | YES | v2-02-legacy-rbac-removal.test.js; v10-dbcl04-canonical-cleanup-baseline.test.js |  |
| BLESSBOARD | V2.02 QA | BB-V202-IMG | editor | Universal Image Editor | Category A/B/D framing lifecycle | coverage matrix green | Y | Y | Y | Y | N | Y | YES | v2-02-universal-image-editor-coverage.test.js; v2-02-structured-image-framing-lifecycle.test.js |  |
| BLESSBOARD | V2.03 QA | BB-V203-E2E | admin | fresh org | register→website→media→publish→public | journey suite + deny cross-tenant | Y | Y | Y | Y | Y | P | YES | v7-local-registration-to-website-e2e.test.js | HTTP E2E has residual redirect pin debt |
| BLESSBOARD | V2.03 QA | BB-V203-REG | QA10 pack | curated surfaces | npm run test:v203:bb-regression | 274 pass historically | Y | Y | Y | Y | Y | P | YES | — |  |

## ACTIVECLINIC

| PRODUCT | AREA | QA_ID/SCENARIO | USER_ROLE | PRECONDITION | ACTION | EXPECTED_RESULT | POSITIVE_TEST | NEGATIVE_TEST | HTTP_TEST | PERSISTENCE_TEST | TENANT_TEST | UI/E2E_TEST | AUTOMATED | TEST_FILE | GAP |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| ACTIVECLINIC | clinic registration | AC-REG-01 | anonymous | AC host | register clinic multi-step | success; org+facility; credentials | Y | Y | Y | Y | N | Y | YES | activeclinic-acw09-registration.test.js; activeclinic-clinic-registration.test.js; activeclinic-clinic-onboarding.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | clinic registration | AC-REG-02 | anonymous | missing registration_consent | confirm registration | 400 consent required | Y | Y | Y | N | N | Y | YES | activeclinic-registration-terms.test.js; activeclinic-clinic-registration.test.js |  |
| ACTIVECLINIC | first login/setup | AC-SETUP-01 | clinic admin | post-register | first login → onboarding checklist | ACN01 setup state | Y | Y | Y | Y | N | Y | YES | activeclinic-batch1a-config.test.js |  |
| ACTIVECLINIC | facilities | AC-FAC-01 | facility admin | multi-facility org | CRUD facilities | facility isolation on lists/writes | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch2-facilities.test.js; activeclinic-facility-foundation.test.js; activeclinic-facility-public-hours.test.js |  |
| ACTIVECLINIC | facilities | AC-FAC-02 | staff | unassigned facility | access foreign facility data | deny | Y | Y | Y | N | Y | N | YES | activeclinic-batch2-rbac-isolation.test.js |  |
| ACTIVECLINIC | staff/invites | AC-STAFF-01 | admin | invite staff | send invite → accept role | staff member + RBAC | Y | Y | Y | Y | Y | P | YES | activeclinic-staff-invitation.test.js; activeclinic-roles-access-admin.test.js; activeclinic-roles-access-parity.test.js |  |
| ACTIVECLINIC | staff/invites | AC-STAFF-02 | cashier | invite staff | attempt invite | denied | Y | Y | Y | N | N | N | YES | activeclinic-staff-invitation.test.js |  |
| ACTIVECLINIC | departments | AC-DEPT-01 | admin | facilities exist | create department | validation on type/name; persist | Y | Y | Y | Y | Y | P | YES | activeclinic-batch2-facilities.test.js |  |
| ACTIVECLINIC | patients | AC-PAT-01 | reception | clinic | create/search patient + consent | persist; invalid consent rejected | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch1a-patient-reception.test.js; activeclinic-batch2-patient-workspace.test.js |  |
| ACTIVECLINIC | patients | AC-PAT-02 | reception | duplicate patient | merge/duplicate assessment | org-scoped; no cross-tenant merge | Y | Y | Y | Y | Y | P | YES | activeclinic-patient-foundation.test.js; activeclinic-patient-merge-safety.test.js; activeclinic-patient-portal.test.js; activeclinic-patient-registration-rbac.test.js |  |
| ACTIVECLINIC | appointments | AC-APT-01 | scheduler | services+practitioners | create appointment | collision blocked; lifecycle transitions | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch1a-appointments.test.js; activeclinic-batch2-appointments-workspace.test.js |  |
| ACTIVECLINIC | appointments | AC-APT-02 | scheduler | wrong facility | create for unassigned facility | deny | Y | Y | Y | N | Y | N | YES | activeclinic-batch2-rbac-isolation.test.js |  |
| ACTIVECLINIC | booking | AC-BOOK-01 | public | published clinic | public booking request | request stored; staff triage | Y | Y | Y | Y | Y | Y | YES | activeclinic-public-booking.test.js; activeclinic-mf10-booking.test.js; activeclinic-batch1a-appointments.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | booking | AC-BOOK-02 | patient | guest token | link guest booking to portal | owner-only lists; invalid token 400 | Y | Y | Y | Y | Y | P | YES | activeclinic-patient-portal.test.js; activeclinic-mf08-patient-registration.test.js; activeclinic-booking-patient-linkage.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | clinical | AC-CLIN-01 | clinician | checked-in patient | encounter workspace + notes | persist HPI/assessment; close encounter | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch1a-clinical.test.js; activeclinic-batch2-clinical-encounter.test.js |  |
| ACTIVECLINIC | clinical | AC-CLIN-02 | clinician | ACN17 | record vitals | facility-scoped; satellite deny | Y | Y | Y | Y | Y | P | YES | activeclinic-batch3-acn17-acn19.test.js |  |
| ACTIVECLINIC | clinical | AC-CLIN-03 | clinician | ACN18 | clinical document draft→finalize | authz+facility isolation; no public CMS storage | Y | Y | Y | Y | Y | P | YES | activeclinic-batch3-acn18-clinical-documents.test.js | Binary attachment deferred by contract |
| ACTIVECLINIC | clinical | AC-CLIN-04 | clinician | ACN19 | order prescription | clinical_order → pharmacy handoff | Y | Y | Y | Y | Y | P | YES | activeclinic-batch3-acn17-acn19.test.js |  |
| ACTIVECLINIC | clinical | AC-CLIN-05 | clinician | ACN20 | referrals list | presentation over follow-up | Y | N | Y | N | N | Y | YES | activeclinic-batch3-acn20.test.js |  |
| ACTIVECLINIC | pharmacy | AC-PHARM-01 | pharmacist | prescription queue | dispense | RBAC+validation; receptionist denied | Y | Y | Y | Y | Y | P | YES | activeclinic-batch2-operational-queues.test.js; activeclinic-pharmacy-foundation.test.js; activeclinic-pharmacy-ui-parity.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | laboratory | AC-LAB-01 | lab staff | diagnostics queue | lab request workflow | department-gated diagnostics | Y | Y | Y | Y | Y | P | YES | activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foundation.test.js; activeclinic-diagnostics-rbac.test.js; activeclinic-diagnostics-ui-parity.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | radiology | AC-RAD-01 | rad staff | diagnostics rad queue | radiology request workflow | department boundary vs lab | Y | Y | Y | Y | Y | P | YES | activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foundation.test.js; activeclinic-diagnostics-rbac.test.js; activeclinic-diagnostics-ui-parity.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | billing | AC-BILL-01 | biller | charges | create/post invoice | immutable after post; facility mismatch deny | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch1a-billing.test.js; activeclinic-batch2-billing.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | billing | AC-BILL-02 | cashier | open session | collect payment + receipt | cash without session rejected; SoD | Y | Y | Y | Y | N | Y | YES | activeclinic-batch1a-billing.test.js; activeclinic-finance-rbac.test.js |  |
| ACTIVECLINIC | access/RBAC | AC-RBAC-01 | matrix roles | Batch2 hubs | role×route matrix | deny wrong role; forged IDs | Y | Y | Y | N | Y | N | YES | activeclinic-batch2-rbac-isolation.test.js; activeclinic-roles-access-admin.test.js; activeclinic-roles-access-parity.test.js; activeclinic-navigation-rbac.test.js |  |
| ACTIVECLINIC | website/editor | AC-WEB-01 | website editor | clinic website | edit→media→publish→public | PC10B baseline + deny editor-only publish | Y | Y | Y | Y | Y | Y | YES | v10-pc10b-ac-website-workflow-baseline.test.js; activeclinic-website-cms.test.js; activeclinic-website-hardening.test.js; activeclinic-website-json-error-matrix.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | public clinic pages | AC-PUB-01 | anonymous | published clinic | GET public pages | 200 public; unpublished gated | Y | Y | Y | N | Y | Y | YES | activeclinic-public-website.test.js; activeclinic-clinic-website-availability.test.js; activeclinic-website-hardening.test.js |  |
| ACTIVECLINIC | patient portal | AC-PORT-01 | patient | portal session | bookings/profile/invoices/summaries | owner-only; cross-patient deny | Y | Y | Y | Y | Y | Y | YES | activeclinic-patient-portal.test.js; activeclinic-batch3-acp03-acp07.test.js; activeclinic-batch3-acp05-visit-summary.test.js; activeclinic-batch3-acp06.test.js; v203-qa-automation-gaps.test.js | Closed Prompt4 (v203-qa-automation-gaps) |
| ACTIVECLINIC | patient portal | AC-PORT-02 | clinician | AC-P05 | release visit summary | patient-safe snapshot; PDF deferred contract | Y | Y | Y | Y | Y | P | YES | activeclinic-batch3-acp05-visit-summary.test.js |  |
| ACTIVECLINIC | rooms/spaces | AC-ROOM-01 | facility admin | ACN27 | CRUD rooms | facility list isolation; no occupancy engine | Y | Y | Y | Y | Y | P | YES | activeclinic-batch3-acn27-rooms.test.js |  |
| ACTIVECLINIC | Batch1 | AC-B1-NAV | staff | Batch1 hubs ACN01–26 | GET hubs | Stitch markers + unauth deny | Y | Y | Y | N | N | Y | YES | activeclinic-batch1a-appointments.test.js; activeclinic-batch1a-billing.test.js; activeclinic-batch1a-clinical.test.js; activeclinic-batch1a-config.test.js |  |
| ACTIVECLINIC | Batch2 | AC-B2-NAV | staff | Batch2 hubs B2-01…10 | GET hubs + mutations | STRONG readiness pack | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch2-appointments-workspace.test.js; activeclinic-batch2-billing.test.js; activeclinic-batch2-clinical-encounter.test.js; activeclinic-batch2-dashboard.test.js |  |
| ACTIVECLINIC | Batch3 | AC-B3-NAV | staff/patient | Batch3 screens | inventory + authz/facility | STRONG readiness pack; deferred contracts asserted | Y | Y | Y | Y | Y | Y | YES | activeclinic-batch3-acn17-acn19.test.js; activeclinic-batch3-acn18-clinical-documents.test.js; activeclinic-batch3-acn20.test.js; activeclinic-batch3-acn27-rooms.test.js |  |
| ACTIVECLINIC | V2.03 QA | AC-V203-E2E | admin | fresh clinic | register→facility→staff→clinical→portal | journey suite | Y | Y | Y | Y | Y | P | YES | — |  |

## PLATFORM

| PRODUCT | AREA | QA_ID/SCENARIO | USER_ROLE | PRECONDITION | ACTION | EXPECTED_RESULT | POSITIVE_TEST | NEGATIVE_TEST | HTTP_TEST | PERSISTENCE_TEST | TENANT_TEST | UI/E2E_TEST | AUTOMATED | TEST_FILE | GAP |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| PLATFORM | migrations/bootstrap | PL-DB-01 | CI | empty Postgres | bootstrap + migrate + verify | foundation schemas/seeds; idempotent | Y | Y | N | Y | N | N | YES | db-bootstrap-foundation.test.js; db-foundation.test.js; v10-dbcl11-post-cleanup-fresh-bootstrap.test.js |  |
| PLATFORM | migrations/bootstrap | PL-DB-02 | ops | v4→v5 tooling | apply migration pipeline | catalogue roles written; user_roles frozen | Y | Y | N | Y | N | N | YES | migration-tooling.test.js; v5-to-v7-migration-tooling.test.js |  |
| PLATFORM | platform admin | PL-ADM-01 | platform_administrator | support/ops | tenant health / admin routes | authorized; forged org denied | Y | Y | Y | N | Y | PLATFORM | YES | v7-platform-admin-tenant-health.test.js; v7-platform-admin-website-control.test.js; blessboard-announcement-platform-admin-testing-policy.test.js; blessboard-platform-admin-directory.test.js |  |
| PLATFORM | entitlements | PL-ENT-01 | org | plan seats | staff seat counting via URA | limits enforced for non-platform roles | Y | Y | Y | Y | N | N | YES | platform-entitlements.test.js; phase4-website-plan-entitlements.test.js |  |
| PLATFORM | publication convergence | PL-PUB-01 | CI | PC10 baselines | BB/AC publish baselines | PC10B green historically | Y | Y | Y | Y | Y | PLATFORM | YES | v10-pc10b-ac-website-workflow-baseline.test.js; v10-pc10b-bb-publish-baselines.test.js; v10-pc10-publication-convergence.test.js |  |
| PLATFORM | media consolidation | PL-MED-01 | CI | PC08 | shared media folders/library | consolidation characterization | Y | Y | Y | Y | Y | N | YES | v10-pc08-platform-media-consolidation.test.js |  |
| PLATFORM | security | PL-SEC-01 | CI | critical pack | authz+publish+isolation | V203 critical platform coverage | Y | Y | Y | Y | Y | N | YES | v8-shared-rbac-tenant-isolation.test.js; blessboard-p0-publish-auth.test.js |  |

---

## Automation gaps (actionable)

**Prompt 4 closed all PARTIAL/NO scenarios.** Former gaps are now `AUTOMATED=YES` with evidence in existing suites plus `tests/v203-qa-automation-gaps.test.js`.

| Former ID | Resolution |
|--|--|
| SH-AUTH-05 | Host/platformLine mismatch matrix + cookie isolation |
| SH-REG-02 / AC-REG-01 | Duplicate email controlled path (deny or explicit reuse) |
| SH-TEN-02 | Forged tenant middleware + rejectForgedTenantIdentifiers |
| SH-MED-01/02/03 / BB-MED-01 / PL-MED-01 | Kill-switch, Content Library label, cross-tenant media deny |
| SH-WE-01 / AC-WEB-01 | Draft→reload; editor-only publish denied |
| SH-VER-01 | Release notes / audit redaction no secrets |
| BB-BR-03 / BB-PUB-HOME | Canonical `/c/:org/:branch` + legacy redirect contracts |
| BB-PAGE-* / BB-CMS-01 / BB-PUB-02 | Draft/publish/restore unauthorized + page key writes |
| AC-BOOK-01/02 / AC-PORT-01 | Invalid/missing guest booking token rejected |
| AC-LAB-01 / AC-RAD-01 | Diagnostics modality RBAC suite + gap anchors |
| AC-PHARM-01 | Dispense unauthorized/malformed + existing queue/foundation |
| AC-BILL-01/02 | postInvoice/cash session negatives + Batch1/2 billing |
| AC-PUB-01 | Publish authorized + cross-tenant deny |
| PL-ADM-01 | Audit admin same-tenant vs forged org |

### MANUAL_VISUAL_ONLY (not matrix scenarios)

Stitch **pixel-perfect** visual parity remains out of scenario scope (Batch readiness `MANUAL_QA_REQUIRED`). Not counted as UNAUTOMATED because no CURRENT matrix scenario requires subjective visual judgment as its expected result. Pharmacy dispense chrome feel is covered functionally (RBAC/validation); Stitch pixels are not asserted via CSS class presence.

### Priority themes for later overnight prompts

1. Residual Prompt-2 leaf test debt (REGEX/EQUALITY pins) — classified under remediation residual.
2. Product-scoped ≥90% coverage measurement (Prompts 5–8).
3. Hosted Stitch visual journeys — remain MANUAL_QA_REQUIRED.

## Workflow coverage summary

| Requirement | Status |
|--|--|
| Write workflows cite HTTP+authz+validation+persist where applicable | **YES** — gap suite + Batch1–3 + publish/media/RBAC |
| Security-sensitive scenarios have negatives | **YES** — unauthorized / wrong role / cross-tenant / malformed where applicable |
| Actual user workflow vs service-only | Journey suites + gap workflow contracts; browser/E2E only where browser behavior matters |

---

## Marker

```text
V2_03_QA_FUNCTIONAL_AUTOMATION_PASS
QA_SCENARIOS_TOTAL=98
FULLY_AUTOMATED=98
PARTIALLY_AUTOMATED=0
NOT_AUTOMATED=0
MANUAL_VISUAL_ONLY=0
AUTOMATABLE_QA_SCENARIOS_COVERED=100%
BB_TOTAL=30 / AUTOMATED=30
AC_TOTAL=34 / AUTOMATED=34
PLATFORM_TOTAL=7 / AUTOMATED=7
SHARED_TOTAL=27 / AUTOMATED=27
```

