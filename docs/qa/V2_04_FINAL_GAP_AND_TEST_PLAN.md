# V2.04 Final Gap and Test Plan

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_FINAL_GAP_AND_TEST_PLAN` |
| **VERSION** | **2.04** |
| **Mode** | **PLAN UPDATE** (no repository rediscovery; no application code changes) |
| **Inputs** | `V2_04_FEATURE_INVENTORY_AUDIT.md`, `V2_04_FEATURE_TEST_COVERAGE_AUDIT.md`, `V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT.md`, `V2_04_SPEC_COMPLETENESS_GAP_AUDIT.md`, `V2_04_SANITY_COVERAGE_RECONCILIATION.md`, `V2_04_REGISTRATION_STATE_AUDIT.md`, `V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`, `PLATFORM_MULTI_STEP_FORM_STATE_DESIGN.md`, `V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md` |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_RELEASE_GAP_PLAN_REFRESHED`** |

---

## 0. Executive verdict

V2.04 **website / geography / shared-editor smoke** has a valid sanity **PASS** (10 areas). That does **not** close V2.04.

**Closed (not release blockers):**
- **REG-STATE-01=CLOSED** — `PLATFORM_FORM_TESTS=13/13` · `BB_REGISTRATION_TESTS=3/3` · `AC_REGISTRATION_TESTS=2/2` · `SESSIONLESS_FLOW=PASS` · `CROSS_DRAFT_ISOLATION=PASS` · `FINAL=PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED`
- **BB-PROVISION-01=CLOSED** — `CANONICAL_IDENTITY_PROPAGATION=PASS` · `PHONE_REUSE_DIFFERENT_EMAIL=PASS` · `MULTI_CHURCH_ADMIN=PASS` · `ROLLBACK=PASS` · `RETRY=PASS` · `CROSS_TENANT=PASS` · `FOCUSED_TESTS=11/11` · `FINAL=BB_PROVISION_IDENTITY_FIX_COMPLETE`

**Product decisions closed (temporary V2.04):** PD-V204-BB-01..05, PD-V204-AC-01, and Wave2 **PD-V204-BB-P1-01…05 + PD-V204-AC-P1-01…03** — see `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md`. Normative status matrix: `docs/product/V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md`. AC scope: `docs/product/V2_04_AC_PRODUCT_CONTRACT_SCOPE.md`.

**Wave2 applied (2026-10-02):** scoped-review injector wired; dual-role nav linked; session revoke Option A; rate-limit 8/15 freeze; PA membership deny-by-default; public doctor/services allowlist; AC presentation matrix + R08 chrome-only. Focused suite **26/26**.

Still open before production claim:

1. ~~Two HIGH implementation gaps (dual-role / scoped review)~~ **CLOSED Wave2**.  
2. ~~CREATE-UI gender/baptism vs schema (RB-ENG-05)~~ **CLOSED Wave3** (optionalize).  
3. ~~Critical automated test gaps (RB-TEST-01…07)~~ **CLOSED Wave3**.  
4. **BlessBoard Members** FEATURE QA pack — still required (manual).  
5. **Build identity** — sheet captured on TESTING; **BRANCH=UNKNOWN on BB+AC** (hub `V4` not used as product identity) → RB-ID-01 remains open.

**`READY_FOR_PRODUCTION_QA=NO`** — remaining release blockers **6** (MANUAL 5 · BUILD 1); eng/test/product = 0.

**Manual QA ingestion (2026-10-02):** RB-QA-01…05 all **NOT_RUN** — no tester evidence supplied in session (`V2_04_MANUAL_QA_RESULTS_RECORD.md`). NEW_RELEASE_BLOCKERS=0.

**Build identity verification (2026-10-02, READ-ONLY):** BB+AC About Version **2.04**; HOSTED_SHA=`54cdb1f76f5a` (= `origin/V4` tip); app candidate `7c957101…` with docs-only commits to tip; ENV=`testing`; deploy=`moovex-platform-v8-testing`; DB=`moovex-platform-v7` / testing; schemaCompatible; no V9/V10. SHA_MATCH PASS both. BRANCH_IDENTITY=FAIL. Production untouched. Uncommitted Wave2/3 app code not hosted.

---

## 1. Status vocabulary (this plan)

| Column | Allowed values (from audits) |
|--------|------------------------------|
| **SPEC_STATUS** | `COMPLETE` · `AMBIGUOUS` · `BLOCKING_DECISION` · `SPEC_GAP` · `DEFERRED` · `N/A` |
| **IMPLEMENTATION_STATUS** | `FULL` · `PARTIAL` · `ABSENT` · `FOUNDATION` · `UNKNOWN` · `N/A` |
| **AUTOMATED_TEST_STATUS** | `COVERED` · `PARTIAL` · `UNTESTED` · `WEAK` · `N/A` |
| **SANITY_TEST_STATUS** | `SANITY_PASS` · `SANITY_TESTED` · `PARTIAL` · `NOT_SANITY_TESTED` · `OUT_OF_SCOPE` · `N/A` |
| **MANUAL_QA_REQUIRED** | `YES` · `NO` · `AFTER_SPEC` · `AFTER_FIX` |
| **DEFECT_STATUS** | `OPEN` · `DIAGNOSED` · `FIXED` · `CLOSED` · `WAIVED` |

Deduplication rule: one row = one actionable gap. Related FR/AC/DR IDs are listed in **REQ_ID** (primary first).

---

## 1A. CLOSED defects (not release blockers)

| DEFECT_ID | PRODUCT | STATUS | ISSUE | ROOT CAUSE | VERIFICATION | NOTES |
|-----------|---------|--------|-------|------------|--------------|-------|
| **REG-STATE-01** | PLATFORM / BB / AC | **CLOSED** | Multi-step registration draft cleared on mid-wizard GET when `gpRegNav=1` absent → prior-step data loss / forced re-entry | Shared signed-cookie draft existed; **fresh/mid-wizard GET semantics cleared it**. `sessionExists=false` was **not** the cause | `PLATFORM_FORM_TESTS=13/13` · `BB_REGISTRATION_TESTS=3/3` · `AC_REGISTRATION_TESTS=2/2` · `SESSIONLESS_FLOW=PASS` · `CROSS_DRAFT_ISOLATION=PASS` · `FINAL=PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED` | Removed from open gaps / release blockers. |
| **BB-PROVISION-01** | BlessBoard | **CLOSED** | Phone-reuse church provision failed when submitted email ≠ canonical identity email | After phone-matched reuse, role assign re-resolved admin by unmatched registration email → `user_not_found` mislabeled `database_conflict` | `CANONICAL_IDENTITY_PROPAGATION=PASS` · `PHONE_REUSE_DIFFERENT_EMAIL=PASS` · `MULTI_CHURCH_ADMIN=PASS` · `ROLLBACK=PASS` · `RETRY=PASS` · `CROSS_TENANT=PASS` · `FOCUSED_TESTS=11/11` · `FINAL=BB_PROVISION_IDENTITY_FIX_COMPLETE` | Removed from open gaps / known issues. Audit: `V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`. |

---

## 2. P0 — RELEASE BLOCKER

| PRIORITY | PRODUCT | REQ_ID | FEATURE | SPEC_STATUS | IMPLEMENTATION_STATUS | AUTOMATED_TEST_STATUS | SANITY_TEST_STATUS | MANUAL_QA_REQUIRED | GAP | ACTION |
|----------|---------|--------|---------|-------------|----------------------|----------------------|--------------------|--------------------|-----|--------|
| P0 | BB | FR-16 / AC-21 / DR-39 | Leader ↔ managed resource binding + review scope | **TEMPORARY_APPROVED** (PD-V204-BB-P1-01 A) | **FULL Wave2** — injector wired to ministry_leader/department_head | Wave2 focused COVERED | NOT_SANITY_TESTED | YES (FEATURE QA) | ~~unwired~~ CLOSED Wave2 | Manual Members scoped-review scenarios remain |
| P0 | BB | FR-12 / AC-13 / DR-27 | Dual-role Member Portal + Church Management destinations | **TEMPORARY_APPROVED** (PD-V204-BB-P1-02) | **FULL Wave2** — bidirectional `/member`↔`/hq` | Wave2 focused COVERED | NOT_SANITY_TESTED | YES (FEATURE QA) | ~~no cross-links~~ CLOSED Wave2 | Manual dual-role journey remains |
| P0 | BB | FR-01..FR-20 / AC-01..AC-25 | BlessBoard Members feature pack | COMPLETE enough for core auth | Mostly FULL; PARTIAL on FR-12/13/16 | COVERED + product-decision suites | **NOT_SANITY_TESTED** | **YES** | In release scope; no FEATURE_QA_PASS | Run Members FEATURE QA (scenario pack §4) |
| P0 | SHARED | Release identity | Bind tested deploy to candidate | N/A | N/A | N/A | Sheet 2026-10-02; BRANCH UNKNOWN on BB+AC | **YES** | Branch label UNKNOWN (SHA/env/DB/About=2.04 captured) | Rebuild so BB+AC emit V4 (not UNKNOWN); re-verify |
| P0 | BB | AC-23 | Member privacy — no other-member/admin data | COMPLETE | FULL | **COVERED Wave3** | NOT_SANITY_TESTED | YES | ~~CRITICAL_TEST_GAP~~ closed | Manual privacy spot-check remains |
| P0 | BB | AC-11 | New recovery phone verified before use | COMPLETE | FULL | **PARTIAL** (CRITICAL_TEST_GAP) | NOT_SANITY_TESTED | YES | OTP **complete** path not behaviorally tested | Add complete OTP success/fail automated tests + manual phone-change |

**P0 count = 6** (six former P0 product decisions closed as TEMPORARY_APPROVED_FOR_V2_04; REG-STATE-01 / BB-PROVISION-01 already CLOSED)

### 2.0 Closed P0 product decisions (not release blockers)

| ID | APPROVED | CLASS | NOTES |
|----|----------|-------|-------|
| PD-V204-BB-01 | OPTION A | DOC_ONLY + TEST_ONLY | Unique per church; sibling ID strings allowed |
| PD-V204-BB-02 | OPTION A | DOC_ONLY + TEST_ONLY | Select Church binds tenant |
| PD-V204-BB-03 | OPTION A | DOC_ONLY + TEST_ONLY | Phone OTP only; FR-06 V2.04 MUST = phone |
| PD-V204-BB-04 | OPTION A | CODE_CHANGE_REQUIRED | Matrix + lifecycle portal clear + login gate |
| PD-V204-BB-05 | DEFER cells | DOC_ONLY | Already temporary approved |
| PD-V204-AC-01 | OPTION B | DOC_ONLY | Presentation gated; patient non-gated |

### 2.1 BB-PROVISION-01 detail (CLOSED)

| Field | Value |
|-------|--------|
| **Scope** | BlessBoard |
| **Status** | **CLOSED** — identity propagation fix + focused regression **11/11 PASS** |
| **Confirmed root cause** | Phone-matched identity reuse succeeded; role assign re-resolved by unmatched registration email → `user_not_found` mislabeled `database_conflict` |
| **Fix** | Canonical `administratorUserId` for role assign; no email fallback when userId set; `mapRoleAssignmentFailureStatus` |
| **Evidence** | `CANONICAL_IDENTITY_PROPAGATION=PASS` · `PHONE_REUSE_DIFFERENT_EMAIL=PASS` · `MULTI_CHURCH_ADMIN=PASS` · `ROLLBACK=PASS` · `RETRY=PASS` · `CROSS_TENANT=PASS` · `FOCUSED_TESTS=11/11` · `FINAL=BB_PROVISION_IDENTITY_FIX_COMPLETE` |
| **Outstanding** | Optional hosted smoke T-M22 only (not a code / P0 blocker) |

---

## 3. P1 — BEFORE PRODUCTION

| PRIORITY | PRODUCT | REQ_ID | FEATURE | SPEC_STATUS | IMPLEMENTATION_STATUS | AUTOMATED_TEST_STATUS | SANITY_TEST_STATUS | MANUAL_QA_REQUIRED | GAP | ACTION |
|----------|---------|--------|---------|-------------|----------------------|----------------------|--------------------|--------------------|-----|--------|
| P1 | BB | FR-06 / AC-07 | Email recovery channel | **DEFERRED** (PD-V204-BB-03=A) | N/A for V2.04 MUST | N/A | OUT_OF_SCOPE | NO | Phone-only approved | Post-V2.04 FOUNDATION; do not implement in V2.04 |
| P1 | BB | FR-13 / AC-16 / DR-33 | Manual attendance least-privilege (non-cell) | AMBIGUOUS if cells deferred | PARTIAL (perm-gated only) | COVERED for perm deny | NOT_SANITY_TESTED | YES | Cell narrow scope incomplete; OK if cells DEFER | If cells out: document “permission-gated only” for V2.04; manual attendance QA11–12 |
| P1 | BB | CREATE-UI | Gender / baptism on Add Member UI | **CLOSED Wave3** optionalize | **FULL** — optional presentation-only; not persisted | Wave3 COVERED | NOT_SANITY_TESTED | YES FEATURE | ~~mismatch~~ closed by optionalize | Manual Add Member smoke |
| P1 | BB | AC-24 | Ordinary member cannot upload documents | COMPLETE | FULL (absence) | **COVERED Wave3** | NOT_SANITY_TESTED | YES | ~~UNTESTED~~ closed | Manual upload attempt spot-check |
| P1 | BB | AC-25 | History keyed by immutable `member_id` | COMPLETE | FULL (FK) | **COVERED Wave3** | NOT_SANITY_TESTED | YES | ~~PARTIAL~~ closed | Manual history spot-check |
| P1 | BB | AC-12 | Multiple admins coexistence | AMBIGUOUS (AC rewrite needed) | FULL (RBAC) | PARTIAL | NOT_SANITY_TESTED | YES | Only single-actor deny proven | Two-admin fixture test + manual QA18 |
| P1 | BB | BB-CHURCH-ID-CASE-NORM | Case-insensitive Church ID login/activate | COMPLETE intent | FULL (`lower(trim)`) | **UNTESTED** | NOT_SANITY_TESTED | YES | Impl unproven by test | Automate case-variant login/activate |
| P1 | BB | FR-20 / BB-ADMIN-SEARCH | Admin search Church ID/name/phone in scope | COMPLETE | FULL | **COVERED Wave3** | NOT_SANITY_TESTED | YES | ~~WEAK~~ closed | Manual directory search |
| P1 | BB | AC-08 / FR-07 | Lost Church ID — no public recovery | COMPLETE | FULL | COVERED (unit guidance) | NOT_SANITY_TESTED | YES | No HTTP negative for invented recovery endpoint | Manual + optional route-negative automation |
| P1 | BB | QA pack | Member end-to-end FEATURE QA (QA01–QA21 excl. AC-shared) | N/A | N/A | Partial auto elsewhere | NOT_SANITY_TESTED | **YES** | Sanity skipped entire Members surface | Execute BB manual handoff scenarios on identity-bound TESTING |
| P1 | BB | BB-WEBSITE-ENGINE | BB website engine cutover beyond smoke | COMPLETE (platformization) | FULL (per gates) | COVERED | **PARTIAL** sanity | YES | Sanity = edit/save/preview/public only | Manual publish/unpublish/version/restore + true-stale on BB |
| P1 | AC | AC-MW-HUB | Clinic Website Management Hub H01–H06 | SPEC_GAP | Implemented; FUTURE controls informational | PARTIAL | NOT_SANITY_TESTED | YES | Hub not in sanity Studio path | Manual hub QA; confirm FUTURE not false-active |
| P1 | AC | AC-PATIENT-DOMAIN | Staff Add Patient foundation | SPEC_GAP (no AC pack) | FOUNDATION | COVERED (domain) | NOT_SANITY_TESTED | AFTER_SPEC | Excluded from sanity; release gating unclear | After P0 AC scope decision: either foundation smoke QA **or** explicit non-gate waiver |
| P1 | AC | Stitch matrix | MUST vs PRESENTATION vs FUTURE controls | **AMBIGUOUS** (HIGH); non-patient-gated per AC-01 | Presentation shipped | COVERED wiring | SANITY_PASS public/editor only | NO (presentation claim) | Risk of false blockers | Product-signed control matrix (non-blocking for patient) |
| P1 | AC | Public PHI policy | Public website field / PHI rules | **AMBIGUOUS** (HIGH); presentation-scoped | UNKNOWN at contract level | N/A | SANITY_PASS pages load | YES (presentation hygiene) | Privacy undefined for doctor/services pages | Define public-safe field policy; spot-check public pages |
| P1 | AC | R08 booking | Booking entry chrome-only vs domain change | **TEMPORARY_APPROVED** chrome-only | Inherited booking engine | Wave2 COVERED | N/A | YES smoke | Second engine risk closed by PD | Smoke booking entry on FEATURE QA |
| P1 | SHARED | PLAT-WEB-LIFECYCLE | Publish / version / restore / concurrency | COMPLETE (freeze) | FULL (gates) | COVERED suites exist | **PARTIAL** (save/preview only) | YES | Sanity did not prove full lifecycle | Manual lifecycle on AC+BB with identity-bound build |
| P1 | SHARED | PLAT-IMAGE-PAYLOAD | Universal IMAGE object/string contract (comparison A2) | COMPLETE | **FULL** (Wave1 RB-ENG-04) | COVERED (`v2-01` + `v2-04-wave1` 18/18) | NOT_SANITY_TESTED | NO | Closed Wave1 | Keep regression on tip |
| P1 | BB | BB-INLINE-IMAGE | Public inline image pencils (comparison A1) | COMPLETE | **FULL** for page/section photos (Wave1 RB-ENG-03); entity cards structured by design | COVERED (wave1 + coverage matrix) | NOT_SANITY_TESTED | NO | Closed Wave1 | Hosted pencil smoke folds into RB-QA-02/03 |
| P1 | SHARED | PLAT-COUNTRY-AVAIL | Disabled country forged POST reject | COMPLETE | FULL | COVERED auto | **PARTIAL** sanity | YES | Sanity = select only | Confirm on hosted env (QA-03 class) |
| P1 | SHARED | PLAT-MW-CONCURRENCY | True stale rejection | COMPLETE | FULL | COVERED | NOT_SANITY_TESTED | YES | Not in sanity | Manual repeat-edit conflict on both products |
| P1 | BB | DR-51 / sessions | “Relevant” sessions on block/reset (dual-role) | **AMBIGUOUS** (HIGH) | FULL revoke paths (member) | COVERED member paths | NOT_SANITY_TESTED | AFTER_SPEC | Dual-role session classes undefined | Product list session classes; manual block/reset check |
| P1 | BB | DR-52 | Rate-limit thresholds | **TEMPORARY_APPROVED** 8/15 | FULL buckets | Wave2 COVERED | NOT_SANITY_TESTED | YES spot-check | Thresholds frozen Wave2 | Spot-check lockout UX on FEATURE QA |
| P1 | BB | DR-55 | Platform Admin cross-tenant membership actions | **AMBIGUOUS** (HIGH) | FULL separation claimed | N/A | NOT_SANITY_TESTED | AFTER_SPEC | Intervention catalogue incomplete | Enumerate allowed PA actions + audit; negative tenant test |

**P1 count = 22**

---

## 4. P2 — POST-RELEASE

| PRIORITY | PRODUCT | REQ_ID | FEATURE | SPEC_STATUS | IMPLEMENTATION_STATUS | AUTOMATED_TEST_STATUS | SANITY_TEST_STATUS | MANUAL_QA_REQUIRED | GAP | ACTION |
|----------|---------|--------|---------|-------------|----------------------|----------------------|--------------------|--------------------|-----|--------|
| P2 | BB | FR-10 / DR-22 | Block reason required / visibility | AMBIGUOUS (MEDIUM) | FULL block | COVERED | NOT_SANITY_TESTED | NO (unless Product elevates) | Reason/metadata incomplete in spec | Spec appendix: reason required + audit metadata |
| P2 | BB | Requests | Who may CANCEL requests | AMBIGUOUS (MEDIUM) | FULL statuses | COVERED paths | NOT_SANITY_TESTED | NO | Cancel rules underspecified | Spec: requester cancel while PENDING only |
| P2 | BB | FR-14 | QR TTL default/max / timezone | AMBIGUOUS (MEDIUM) | FULL TTL | COVERED | NOT_SANITY_TESTED | NO | Numbers not in contract | Document default/max in appendix |
| P2 | BB | Attendance session lifecycle | draft/open/closed/locked | AMBIGUOUS (MEDIUM) | FULL in product | COVERED | NOT_SANITY_TESTED | NO | Absent from member feature contract | Add mini-spec or mark FOUNDATION transitions |
| P2 | BB | Wrong-branch QR | Accept vs reject | AMBIGUOUS (MEDIUM) | UNKNOWN at plan level | N/A | NOT_SANITY_TESTED | NO | Edge unspecified | Product decide flag vs reject |
| P2 | BB | DR-19 | Preferred worship location field | AMBIGUOUS (MEDIUM) | UNKNOWN | N/A | N/A | NO | Field ownership unclear | Defer field or define preference-only |
| P2 | BB | DOB / name match | Dup warn + activation name composition | AMBIGUOUS (MEDIUM) | FULL-ish | COVERED dups | NOT_SANITY_TESTED | NO | Edge cases underspecified | Spec clarify optional DOB + match string |
| P2 | BB | DR-2 | Church ID charset / length | AMBIGUOUS (MEDIUM) | FULL alphanumeric path | COVERED | NOT_SANITY_TESTED | NO | Format not frozen | Spec freeze charset/max length |
| P2 | BB | Exceptional delete | Who / when | AMBIGUOUS (MEDIUM) | No ordinary hard delete | N/A | N/A | NO | Exception path vague | Affirm no UI hard delete in V2.04 |
| P2 | BB | DR-43 / notify | In-app notifications for MUST events | RECOMMENDED / weak | N/A | N/A | N/A | NO | No MUST notify ACs | Explicit “non-blocking for V2.04” or elevate later |
| P2 | BB | Idempotency | Create / activate / join double-submit | AMBIGUOUS (MEDIUM) | Partial uniqueness | Partial | NOT_SANITY_TESTED | NO | Not fully specified | Spec intent + harden later |
| P2 | BB | FR-18 vs forms | Uploads vs form attachments | AMBIGUOUS (MEDIUM) | FULL journey restriction | UNTESTED | NOT_SANITY_TESTED | NO | Adjacent forms boundary | Clarify in privacy appendix |
| P2 | BB | Role bundles | Pastor/Secretary default entitlements | AMBIGUOUS (MEDIUM) | Catalogue grants | N/A | N/A | NO | Title vs permission tension | Publish role→permission matrix |
| P2 | BB | Perm key names | `members.church_id.manage` vs `members.manage_church_id`; `requests.review` | DOC_GAP (LOW) | Catalogue keys differ | COVERED code keys | N/A | NO | Spec/code string drift | Align Canonical Spec to catalogue (or aliases) |
| P2 | BB | Audit metadata table | Required reason/before/after | AMBIGUOUS (HIGH→P2 if core audits exist) | FULL privileged audits | COVERED | NOT_SANITY_TESTED | NO | Metadata completeness | Mandate metadata table post-release hardening |
| P2 | BB | Peak/late Stitch | Attendance ops in Stitch not in Canonical | AMBIGUOUS (LOW) | Screens exist | N/A | NOT_SANITY_TESTED | NO | Contract vs design split | Mark Stitch-only or add later |
| P2 | AC | AC-E01-E02-POLISH | Editor chrome polish | DEFERRED polish | CLOSE / POST_QA_POLISH | COVERED batch 5/7 | SANITY_PASS editor | NO | Non-blocker backlog | V2.05 polish |
| P2 | AC | AC-STITCH-MED-GAPS | Medium visual gaps | DEFERRED | Documented | N/A | N/A | NO | Non-blocker | V2.05 backlog |
| P2 | AC | Patient AC list | Staff Add Patient acceptance pack | SPEC_GAP (MEDIUM) | FOUNDATION | COVERED domain | NOT_SANITY_TESTED | AFTER_SPEC | No AC-01..n | Publish list **or** keep non-gated |
| P2 | AC | Facility websites | Still NOT SUPPORTED? | AMBIGUOUS (MEDIUM) | Historical rule | N/A | N/A | NO | Scope creep risk | Reaffirm in AC V2.04 notes |
| P2 | SHARED | PLAT-COLOR-THEME | Theme token hosted gate | COMPLETE | FULL | COVERED | NOT_SANITY_TESTED | NO | Sanity silent | Optional re-spot on next deploy |
| P2 | SHARED | PLAT-ADMIN-WEB-CONSOLE | Platform Admin website console | COMPLETE | FULL | COVERED | NOT_SANITY_TESTED | NO | Not in product sanity | Post-release console smoke |
| P2 | SHARED | PLAT-PERSON / DUP / STAFF-WF / APPROVAL | Person + approval foundations | FOUNDATION | FOUNDATION | COVERED | NOT_SANITY_TESTED | NO | Not sanity-proven | Opportunistic regression |
| P2 | SHARED | PLAT-ASSET-VERSION / PLAT-VERSION-2.04 | Asset bust + About 2.04 | COMPLETE | FULL | COVERED | NOT_SANITY_TESTED | NO | Sanity title-only | Confirm on identity-bound About page |

**P2 count = 24**

---

## 5. DEFERRED / NOT A DEFECT

| PRIORITY | PRODUCT | REQ_ID | FEATURE | SPEC_STATUS | IMPLEMENTATION_STATUS | AUTOMATED_TEST_STATUS | SANITY_TEST_STATUS | MANUAL_QA_REQUIRED | GAP | ACTION |
|----------|---------|--------|---------|-------------|----------------------|----------------------|--------------------|--------------------|-----|--------|
| DEFERRED | BB | DR-15 | Sophisticated duplicate merge | DEFERRED | ABSENT by design | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | DR-35 | Staff-scans-member QR | DEFERRED | ABSENT by design | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | DR-50 | Full Visitor journey | DEFERRED | Boundary only (BR-11) | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | DR-48 | CSV bulk import UI | DEFERRED | Incomplete UI | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | BB-NONGOAL-NOTIFY | Advanced multi-channel notify config | DEFERRED | N/A | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | BB-NONGOAL-XFER-UX | Full cross-church transfer UX | DEFERRED | Foundation isolation only | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | BB | DR-28-UX | Multi-membership switching UX | DEFERRED | Data FOUNDATION only | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | AC | AC-H03-H06-FUTURE | Nine FUTURE_CAPABILITY hub controls | DEFERRED | Informational; not false-active | PARTIAL hub | OUT_OF_SCOPE as MUST | NO | — | Must remain non-false-active |
| DEFERRED | AC | ACN18 / ACP05 / ACN27 | Clinical docs binaries; Visit PDF; rooms occupancy | DEFERRED (V2.03 inherit) | Out of V2.04 | N/A | OUT_OF_SCOPE | NO | — | Keep backlog |
| DEFERRED | — | Sanity website/geo PASSes | Unified login/reg, geo, studio, public, image | N/A | N/A | Separate | **SANITY_PASS** ×10 | NO | Not a gap | **Do not invalidate**; not FEATURE_QA_PASS |
| NOT_A_DEFECT | SHARED / BB / AC | REG-STATE-01 | Multi-step registration draft continuity | RESOLVED | FULL (hydrate + PRG + merge) | COVERED (focused suites) | N/A | NO | Was draft clear-on-GET | **CLOSED** — see §1A; not outstanding |

**DEFERRED / NOT A DEFECT count = 11** (9 backlog + sanity PASSes preserved + REG-STATE-01 closed)

---

## 6. Minimum additional test pack to close V2.04

**Rules**

- No test code in this document.  
- Pack assumes P0 product decisions are resolved (and HIGH fixes landed where Product keeps the MUST).  
- Does **not** re-prove the 10 sanity areas already **SANITY_PASS**.  
- Does **not** invent ActiveClinic ACs; AC rows below are inventory-scoped or presentation smoke only.  
- Does **not** count already-passing **REG-STATE-01** tests as outstanding.

### 6.1 Automated tests required (new / strengthen)

| TEST_ID | REQ_ID | SCENARIO | EXPECTED | AUTOMATED_OR_MANUAL |
|---------|--------|----------|----------|---------------------|
| T-A01 | AC-23 / FR-17 | Authenticated member A requests member B profile/admin data via portal routes | Denied / own-scope only; no B private fields | AUTOMATED |
| T-A02 | AC-24 / FR-18 | Ordinary member portal surfaces + any upload endpoints | No file upload UI; upload attempt rejected or 404 | AUTOMATED |
| T-A03 | AC-11 / FR-09 | Start phone change → complete OTP success; complete OTP fail | Pending until success; verified only after success; fail leaves unverified | AUTOMATED |
| T-A04 | AC-25 | Change Church ID then load attendance + join history | Records still resolve via `member_id`; history intact | AUTOMATED |
| T-A05 | BB-CHURCH-ID-CASE-NORM / FR-05 | Activate/login with `ch-10001` vs `CH-10001` | Same membership; success | AUTOMATED |
| T-A06 | FR-16 / AC-21 / DR-39 | Production-like mount **with** `resolveManagedResourceIds`; leader reviews only managed resource; unmanaged denied | Scoped approve/reject works; unmanaged fail-closed; broad admin still works | AUTOMATED |
| T-A07 | FR-12 / AC-13 / DR-27 | User with member portal + admin perms | Both destinations reachable (cross-links or documented entry); no privacy leak across shells | AUTOMATED |
| T-A08 | FR-06 / AC-07 / DR-10 | Recovery when phone missing and verified email present (**only if** Product chooses option B) | Email OTP path works; enumeration-safe; phone path unchanged | AUTOMATED |
| T-A09 | AC-12 / FR-11 | Two distinct admins with `members.*` on same church | Both can perform authorized admin actions; neither blocked by “single admin” assumption | AUTOMATED |
| T-A10 | FR-20 | Admin directory search by Church ID, name, phone; out-of-scope tenant | In-scope hits; cross-tenant miss/deny | AUTOMATED |
| T-A11 | AC-08 / FR-07 | Attempt public automated Church ID recovery endpoint/flow | No automated recovery; guidance only | AUTOMATED |
| T-A12 | CREATE-UI / FR-01 | Add Member with gender/baptism (**after** schema or UI fix) | Persists **or** UI no longer requires absent columns | AUTOMATED |

*(T-P01..T-P08 for BB-PROVISION-01 are **CLOSED** — covered by `tests/v2-04-bb-church-provisioning-phone-reuse.test.js` 11/11; not outstanding.)*

**`NEW_AUTOMATED_TESTS_REQUIRED=12`** (Members/privacy pack only; REG-STATE and BB-PROVISION suites **excluded**)

### 6.2 Manual scenarios required

| TEST_ID | REQ_ID | SCENARIO | EXPECTED | AUTOMATED_OR_MANUAL |
|---------|--------|----------|----------|---------------------|
| T-M01 | Release identity | On TESTING: record branch, app SHA, deploy SHA, DB id, migration ceiling (platform ≤047, BB ≤122 or current) | Identity sheet matches candidate; About shows 2.04 | MANUAL |
| T-M02 | FR-01 / AC-01..02 | Staff creates member with Church ID; visitor/self cannot create | Member created; self-create blocked | MANUAL |
| T-M03 | FR-02 / BR-01..03 | Duplicate Church ID; likely person duplicate warning | Hard-block ID dup; warn without auto-merge | MANUAL |
| T-M04 | FR-03..05 / AC-03..06 | First activation (email optional); returning Church ID + password; weak password rejected | Activation + login per policy | MANUAL |
| T-M05 | FR-06 / AC-07 | Forgot password via verified phone OTP; exercise Product decision A or B | Recovery succeeds on allowed channel only | MANUAL |
| T-M06 | FR-07 / AC-08 | Lost Church ID path | Admin-assisted guidance; no public auto recovery | MANUAL |
| T-M07 | FR-09..10 / AC-09..11,14..15 | Profile edit; phone verify; block/unblock; blocked session | Protections + block without history loss | MANUAL |
| T-M08 | FR-12 / AC-13 | Dual-role user journey | Clear Member vs Management destinations after fix | MANUAL |
| T-M09 | FR-13..14 / AC-16..19 | Manual attendance; QR check-in; duplicate; correction; close/lock | Scoped authz; TTL; audit | MANUAL |
| T-M10 | FR-15..16 / AC-20..22 | Ministry request; scoped approve/reject; self-approve attempt | PENDING→decision; self-approve denied; leaders scoped after injector fix | MANUAL |
| T-M11 | FR-17 / AC-23 | Member privacy spot-check | Cannot view other members’ private/admin data | MANUAL |
| T-M12 | FR-18 / AC-24 | Member portal upload attempt | No upload capability | MANUAL |
| T-M13 | FR-20 | Admin search by Church ID / name / phone | In-scope results only | MANUAL |
| T-M14 | FR-11 / AC-12 / QA18 | RBAC negative + second admin | Permission deny; multi-admin works | MANUAL |
| T-M15 | Tenant isolation / QA19 | Cross-church access attempts | Isolated | MANUAL |
| T-M16 | BB-WEBSITE-ENGINE / PLAT-WEB-LIFECYCLE | BB publish / unpublish / version / restore / true-stale | Lifecycle correct; no false conflicts | MANUAL |
| T-M17 | AC-MW-PUBLIC / EDITOR / HUB | AC public + editor regression beyond sanity; hub H01–H06 | Matches Product matrix; FUTURE not false-active | MANUAL |
| T-M18 | PLAT-REG-GEOGRAPHY / COUNTRY-AVAIL | Hosted disabled-country POST + city catalogue sanity refresh | Reject disabled; cities country-aware | MANUAL |
| T-M19 | PLAT-MW-CONCURRENCY | AC+BB repeat-edit conflict | True stale rejection | MANUAL |
| T-M20 | AC-PATIENT-DOMAIN | Staff Add Patient foundation smoke (**only if** Product keeps foundation release-gated) | Foundation behaviors match declared ACs/waiver | MANUAL |
| T-M21 | AC public PHI | Spot-check public doctor/services pages vs public-safe policy (**after** policy exists) | No prohibited PHI | MANUAL |
| T-M22 | BB-PROVISION-01 | Hosted: register new church with existing phone + different email (**post-fix smoke**) | Success path; no false `database_conflict`; admin can open new org | MANUAL (optional hosted confirmation) |

**`MANUAL_SCENARIOS_REQUIRED=22`**

### 6.3 Spec decisions required (minimum set)

| # | REQ_ID / theme | Decision needed |
|---|----------------|-----------------|
| 1 | FR-02 / BR-01 | Church ID unique per **church** vs per **organization** |
| 2 | DR-28 / login | Multi-membership session/tenant binding rules |
| 3 | FR-06 / DR-10 | Email fallback: phone-only **or** verified-email OTP |
| 4 | Statuses | Membership + portal transition matrices + actors |
| 5 | DR-39 / permissions | Leader↔resource binding model + frozen permission key list |
| 6 | DR-46 | Cells **in** or **out** of V2.04 |
| 7 | AC contract | Canonical AC V2.04 Spec **or** presentation-only + patient foundation gating waiver |

**`SPEC_DECISIONS_REQUIRED=1`** (DR-39 keys; six prior decisions temporary-approved)

---

## 7. Closure order (recommended)

1. **Build identity** — sheet captured; remaining: fix BB+AC UNKNOWN branch → re-verify (T-M01).  
2. ~~Resolve blocking product decisions~~ — **DONE** (temporary approvals).  
3. Land **P0 HIGH fixes** (injector wiring; dual-role destinations).  
4. Add **T-A01..T-A12** (**skip T-A08** — phone-only approved).  
5. Execute **T-M02..T-M21** (Members FEATURE QA).  
6. Re-evaluate P1 residuals; defer P2 explicitly to backlog.  
7. Only then: `READY_FOR_PRODUCTION_QA` → **YES** candidate.

*(REG-STATE-01 and BB-PROVISION-01 already CLOSED — skip.)*

---

## 8. Counts

| Bucket | Count |
|--------|------:|
| P0 RELEASE BLOCKER rows | **6** |
| P1 BEFORE PRODUCTION rows | **21** |
| P2 POST-RELEASE rows | **24** |
| DEFERRED / NOT A DEFECT rows | **12** (+ email recovery deferred) |
| CLOSED defects (not blockers) | **2** (REG-STATE-01, BB-PROVISION-01) |
| CLOSED P0 product decisions | **6** (PD-V204-BB-01..05, PD-V204-AC-01) |
| New automated tests in min pack | **12** (skip T-A08) |
| Manual scenarios in min pack | **22** |
| Spec decisions required | **1** (DR-39 binding keys; parallel to P0 injector) |

Sanity areas already PASS: **10** (preserved; not re-opened).

### Wave1 engineering closures (2026-10-02)

| ID | Status | Proof |
|----|--------|-------|
| RB-ENG-03 (A1 BB inline image pencils) | **CLOSED** | Page heroes / welcome / about photos on shared `editable-image` |
| RB-ENG-04 (A2 universal image payload) | **CLOSED** | Aliases + object dual-write; focused **18/18 PASS** |

### Wave6 build-identity verification (2026-10-02, READ-ONLY)

| Field | Value |
|-------|--------|
| VERSION | 2.04 |
| BB BRANCH / AC BRANCH | UNKNOWN / UNKNOWN (hub V4 not applied to product hosts) |
| FULL_GIT_SHA | `54cdb1f76f5af70593fdaf54366ce0c64ae9885c` |
| HOSTED_SHA | `54cdb1f76f5a` (BB=AC) |
| EXPECTED_CANDIDATE_SHA | app `7c957101ad5536d1a7323b051d8d8d7d8ff149f5`; tip docs `54cdb1f76f5a…` |
| SHA_MATCH | BB PASS · AC PASS |
| ENVIRONMENT | testing |
| DEPLOYMENT_NAME | moovex-platform-v8-testing |
| DB_IDENTITY / DB_ENVIRONMENT | moovex-platform-v7 / testing |
| BUILD_LABEL | UNKNOWN testing |
| MIGRATION_CEILING | schemaCompatible; capability refs ≤ BB099 / AC034 / platform031 |
| Docs vs app | `7c957101..54cdb1f76f5a` docs-only; Wave2/3 app work uncommitted / not hosted |
| Production | untouched |

Release readiness remaining blockers after Wave6 verify: **6** (see `V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md`).

---

REG_STATE_01=CLOSED
BB_PROVISION_01=CLOSED
P0_PRODUCT_DECISION_REMAINING=0
P0=6
P1=21
P2=24
NEW_AUTOMATED_TESTS_REQUIRED=12
MANUAL_SCENARIOS_REQUIRED=22
SPEC_DECISIONS_REQUIRED=1
WAVE1_ENG_03=CLOSED
WAVE1_ENG_04=CLOSED
READY_FOR_PRODUCTION_QA=NO
BB_SHA_MATCH=PASS
AC_SHA_MATCH=PASS
BRANCH_IDENTITY=FAIL
ENVIRONMENT_IDENTITY=PASS
DB_IDENTITY=PASS
PRODUCTION_UNTOUCHED=YES
BUILD_IDENTITY_REMAINING=1
FINAL=V2_04_BUILD_IDENTITY_VERIFIED
