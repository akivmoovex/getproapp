# V2.04 Final Manual QA — 5 Remaining Scenarios

**Mode:** READ-ONLY extract (no code).  
**Date:** 2026-10-02  
**Source:** `V2_04_RELEASE_BLOCKER_CLOSURE_QUEUE.md`, `V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md`, `V2_04_FINAL_GAP_AND_TEST_PLAN.md`  
**Scope:** Exactly **RB-QA-01…05**. Excludes build identity (RB-ID-01), closed eng/test/product items, P2 polish, deferred features.

**Shared precondition (all five):** TESTING tip is identity-bound (branch, app SHA, deploy SHA, DB identity, migration ceiling, About=2.04) before recording FEATURE_QA evidence. Do not treat unbound sanity host results as release evidence.

---

## RB-QA-01 — BlessBoard Members FEATURE QA pack

```
QA_ID: RB-QA-01
PRODUCT: BB
FEATURE: BlessBoard Members end-to-end FEATURE QA (T-M02–T-M15 class)
PRECONDITION:
  - Identity-bound TESTING deploy
  - Staff admin + ordinary member + dual-role (member + HQ/branch admin) test accounts on one church
  - Second church available for isolation checks
TEST_STEPS:
  1. Staff Add Member: create member with Church ID; confirm visitor/self-create cannot create membership.
  2. Duplicate Church ID → hard block; likely-person match → warn without auto-merge.
  3. First-time activate (email optional) + returning Church ID/password login; reject weak password.
  4. Forgot password via verified phone OTP only; Lost Church ID shows admin-assisted guidance only.
  5. Member profile edit + pending phone OTP verify; staff block/unblock; blocked session cannot continue.
  6. Dual-role: open Member portal and Church management via bidirectional nav (/member ↔ /hq) without second login.
  7. Attendance: manual check-in + QR path; duplicate attempt; correction; close/lock with scoped authz.
  8. Ministry/department join request: leader approves managed resource; unmanaged deny; self-approve denied; broad-review admin can approve.
  9. Privacy: member A cannot open member B private/admin data; no document upload control in member portal.
  10. Admin directory search by Church ID / name / phone → in-scope hits only.
  11. RBAC negative (missing permission denied) + second admin still works; cross-church URL/ID attempts isolated.
EXPECTED_RESULT:
  - Each step PASS per V2.04 Members MUST behavior; dual-role and scoped review work on production mount
  - FEATURE_QA note lists PASS/FAIL per step with tip SHA
FAILURE_CONDITION:
  - Any MUST step fails (create/auth/recovery/block/dual-role/attendance/scoped review/privacy/search/isolation)
  - Dual-role destinations missing or scoped leader can act outside managed resources
EVIDENCE_TO_CAPTURE:
  - Dated FEATURE_QA note bound to tip SHA
  - Screenshots or short clips for fail steps; Church IDs used (redact phones if needed)
RELATED_REQUIREMENT: FR-01..20 / AC-01..25 (Members pack); FR-12 dual-role; FR-16 scoped review
RELATED_AUTOMATED_TEST: tests/v2-04-wave2-product-decisions.test.js; tests/v2-04-wave3-eng-test-closures.test.js (RB-TEST-01…06); tests/v2-04-bb-member-auth.test.js; tests/v2-04-bb-m01-m02-members.test.js
```

---

## RB-QA-02 — Website lifecycle hosted (AC + BB)

```
QA_ID: RB-QA-02
PRODUCT: PLATFORM
FEATURE: Shared website lifecycle beyond sanity (publish / unpublish / version / restore / true-stale)
PRECONDITION:
  - Identity-bound tip (`7c957101` or later)
  - One ActiveClinic clinic + one BlessBoard church with website.edit / publish permission
TEST_STEPS:
  1. On AC: Edit Website → save draft → preview draft → publish → confirm public shows published content.
  2. Unpublish / take offline (or equivalent) → public no longer shows prior live content as published.
  3. Publish again; open version history; restore a prior version; confirm preview/public reflect restore rules.
  4. Repeat steps 1–3 on BB HQ/branch website editor with the same lifecycle verbs.
  5. Optional cross-check: media replace on one surface survives draft→publish without string-only payload loss.
EXPECTED_RESULT:
  - AC and BB both complete draft → preview → publish → unpublish → version → restore without silent failure
  - Public matches published state; draft-only changes stay off public until publish
FAILURE_CONDITION:
  - Publish does not update public; unpublish leaves stale public; restore fails or corrupts content on either product
EVIDENCE_TO_CAPTURE:
  - Hosted lifecycle QA note with tip SHA for AC and BB
  - Before/after public URLs + version IDs restored
RELATED_REQUIREMENT: PLAT-WEB-LIFECYCLE; BB-WEBSITE-ENGINE; comparison A4
RELATED_AUTOMATED_TEST: tests/v2-04-wave3-eng-test-closures.test.js (RB-TEST-07); tests/shared-website-editor-wave*.test.js; tests/v2-04-wave1-bb-inline-image-contract.test.js
```

---

## RB-QA-03 — ActiveClinic hub + editor smoke

```
QA_ID: RB-QA-03
PRODUCT: AC
FEATURE: Clinic Website Management Hub + Edit Website draft/publish smoke
PRECONDITION:
  - Identity-bound tip
  - Clinic admin with website management access; AC-WEB-EDITOR-01 fix already on tip
TEST_STEPS:
  1. Open Clinic Website Management Hub (H01–H06 surface).
  2. Confirm hub is management-only: no fake public canvas / placeholder site pretending to be the live editor.
  3. Click Edit Website → land in real editor.
  4. Change a visible field → save draft → preview → publish smoke.
  5. Confirm FUTURE/informational hub controls are not presented as active MUST capabilities.
EXPECTED_RESULT:
  - Hub management-only; Edit Website opens editor; draft/publish smoke succeeds
  - FUTURE controls remain non-false-active
FAILURE_CONDITION:
  - Hub shows fake canvas as primary editing surface; Edit Website dead-ends; draft/publish smoke fails
EVIDENCE_TO_CAPTURE:
  - Hub screenshot + editor URL after Edit Website
  - Draft/publish smoke note bound to tip SHA
RELATED_REQUIREMENT: AC-MW-HUB H01–H06; AC website editor; PD-V204-AC-P1-01 PRESENTATION matrix
RELATED_AUTOMATED_TEST: AC-WEB-EDITOR-01 closure suites / shared editor wave tests; tests/v2-04-wave3-eng-test-closures.test.js (RB-TEST-07 matrix)
```

---

## RB-QA-04 — Geography + concurrency hosted

```
QA_ID: RB-QA-04
PRODUCT: PLATFORM
FEATURE: Disabled-country registration reject + true stale repeat-edit on AC and BB
PRECONDITION:
  - Identity-bound tip
  - Registration flow with country catalogue; editors for AC + BB with concurrent-edit support
TEST_STEPS:
  1. Geography: on registration, select/enable a disabled country via forged or direct POST (QA-03 class) → expect reject.
  2. Confirm city suggestions remain country-aware for an allowed country (smoke).
  3. Concurrency on AC: open same website field in two sessions; save from A; save stale payload from B → true stale rejection (not silent overwrite).
  4. Repeat concurrency step on BB website editor.
EXPECTED_RESULT:
  - Disabled-country POST rejected with clear error; cities respect country
  - Stale second save rejected on both AC and BB
FAILURE_CONDITION:
  - Disabled country accepted; stale save overwrites without conflict; only one product handles stale correctly
EVIDENCE_TO_CAPTURE:
  - Hosted geo + concurrency note with tip SHA
  - Response/status for disabled-country POST; stale conflict message screenshots (AC + BB)
RELATED_REQUIREMENT: PLAT-COUNTRY-AVAIL / QA-03; PLAT-MW-CONCURRENCY; PLAT-REG-GEOGRAPHY
RELATED_AUTOMATED_TEST: tests/v2-04-qa-03-platform-country-availability.test.js; tests/v2-04-mini-website-repeat-edit.test.js
```

---

## RB-QA-05 — Public PHI / field allowlist spot-check

```
QA_ID: RB-QA-05
PRODUCT: AC
FEATURE: Public doctor + services pages vs PD-V204-AC-P1-02 allowlist
PRECONDITION:
  - Identity-bound tip preferred
  - Clinic with at least one public doctor and one public service published
  - Policy: allowlist-driven public fields only (PD-V204-AC-P1-02)
TEST_STEPS:
  1. Open public doctors list + one doctor profile page.
  2. Open public services list + one service detail page.
  3. Confirm only public-safe fields appear (display name, title/role, specialty/department, approved photo/bio, org-approved public contact/location as applicable).
  4. Confirm absence of private staff email/phone, internal IDs used as secrets, auth identifiers, clinical notes, patient/PHI, editHref/admin links.
  5. Optional: booking chrome (R08) hands off to existing book URL without exposing clinical/patient data.
EXPECTED_RESULT:
  - Public pages match allowlist; no prohibited private/PHI fields
FAILURE_CONDITION:
  - Any private contact, clinical/patient data, or non-allowlisted internal field visible on public HTML
EVIDENCE_TO_CAPTURE:
  - PHI spot-check note vs PD-V204-AC-P1-02
  - Public URLs + redacted HTML snippets or screenshots of doctor/services pages
RELATED_REQUIREMENT: PD-V204-AC-P1-02; AC public website field / PHI policy; PD-V204-AC-P1-03 R08 chrome-only
RELATED_AUTOMATED_TEST: tests/v2-04-wave2-product-decisions.test.js (AC-P1-02 allowlist); src/activeclinic/website/publicCatalogueFieldPolicy.js
```

---

## Counts

| PRODUCT | QA_IDs | n |
|---------|--------|--:|
| BB | RB-QA-01 | 1 |
| AC | RB-QA-03, RB-QA-05 | 2 |
| PLATFORM | RB-QA-02, RB-QA-04 | 2 |
| **Total** | RB-QA-01…05 | **5** |

## Ingestion results (2026-10-02)

Session input contained **no completed tester evidence**. All five remain **NOT_RUN**.  
Authoritative record: `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md`.

| QA_ID | RESULT | TESTER_EVIDENCE | DEFECT_ID | NOTES |
|-------|--------|-----------------|-----------|-------|
| RB-QA-01 | NOT_RUN | None | — | Not supplied in session |
| RB-QA-02 | NOT_RUN | None | — | Not supplied in session |
| RB-QA-03 | NOT_RUN | None | — | Not supplied in session |
| RB-QA-04 | NOT_RUN | None | — | Not supplied in session |
| RB-QA-05 | NOT_RUN | None | — | Not supplied in session |

```
MANUAL_QA_SCENARIOS=5
BB_SCENARIOS=1
AC_SCENARIOS=2
PLATFORM_SCENARIOS=2
MANUAL_QA_PASS=0
MANUAL_QA_FAIL=0
MANUAL_QA_BLOCKED=0
MANUAL_QA_NOT_RUN=5
FINAL=V2_04_MANUAL_QA_RESULTS_RECORDED
```
