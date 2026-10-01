# V2.04 Product Decision Register

**Status:** ACTIVE — **six P0 + eight Wave-2 P1 product decisions TEMPORARY_APPROVED_FOR_V2_04** (REVIEW_LATER=YES)  
**Scope:** Unresolved product decisions blocking or materially affecting V2.04 closeout  
**Sources (read-only extraction):** `docs/qa/V2_04_P0_BURNDOWN.md`, `docs/qa/V2_04_FINAL_GAP_AND_TEST_PLAN.md`, completed V2.04 audits, BlessBoard V2.04 Canonical Feature Specification FINAL, Decision Register inventory excerpts, ActiveClinic Stitch/decision docs  
**Policy:** Do not reopen approved canonical decisions. Non-critical items may receive `TEMPORARY_APPROVED_FOR_V2_04`. Critical items require Product review before implementation of the chosen option.

---

## REVIEW QUEUE

| ID | PRODUCT | QUESTION | CRITICALITY | RECOMMENDATION | STATUS |
|----|---------|----------|-------------|----------------|--------|
| PD-V204-BB-01 | BB | Church ID unique per church or per organization? | CRITICAL | OPTION A approved | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-02 | BB | How is tenant context bound for multi-membership login/activation? | CRITICAL | OPTION A approved | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-03 | BB | What does recovery email fallback “where available” mean? | CRITICAL | OPTION A approved | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-04 | BB | Who may transition membership/portal statuses, and when? | CRITICAL | OPTION A approved · matrix normative | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-05 | BB | Are cells in V2.04 scope (`MUST IF CELLS`)? | NON_CRITICAL | DEFER cells for V2.04 | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-01 | AC | Canonical AC Feature Spec vs non-gated presentation/foundation? | CRITICAL | OPTION B approved | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-01 | BB | DR-39 leader↔resource binding keys | CRITICAL | OPTION A — ministry/dept assignment IDs + `events.manage` broad | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-02 | BB | Dual-role destinations (FR-12) confirm | NON_CRITICAL | Bidirectional Member Portal ↔ Church Mgmt (existing shells) | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-03 | BB | DR-51 “relevant” sessions on block/reset | CRITICAL | OPTION A — revoke all church-scoped sessions for userId | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-04 | BB | DR-52 rate-limit thresholds | NON_CRITICAL | Freeze **8 / 15 min** per bucket (temporary) | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-05 | BB | DR-55 Platform Admin cross-tenant actions | CRITICAL | OPTION A — deny-by-default; empty V2.04 allowlist | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-01 | AC | Stitch control matrix MUST vs PRESENTATION | NON_CRITICAL | website/editor=PRESENTATION; patient=FOUNDATION; else FUTURE | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-02 | AC | Public PHI / field policy | CRITICAL | OPTION A — allowlist-driven public-safe fields only | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-03 | AC | R08 booking chrome vs domain | NON_CRITICAL | R08 chrome/handoff only; reuse existing booking engine | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P2-01..15 | BB/AC | See §P1/P2 append | — (P2) | See each row | OPEN |

**Engineering may proceed without Product review only on:** `PD-V204-BB-05` (temporary defer).  
**Approved for V2.04 (temporary):** `PD-V204-BB-01`…`05`, `PD-V204-AC-01`, and all eight Wave-2 P1 IDs above. All `REVIEW_LATER=YES`. Do not reopen earlier approved decisions.

---

## Classification of the 6 P0_PRODUCT_DECISION inputs

| Burn-down ID | Decision ID | Validation class | Criticality |
|--------------|-------------|------------------|-------------|
| P0-01 | PD-V204-BB-01 | TRUE_PRODUCT_DECISION | CRITICAL |
| P0-02 | PD-V204-BB-02 | TRUE_PRODUCT_DECISION | CRITICAL |
| P0-03 | PD-V204-BB-03 | TRUE_PRODUCT_DECISION | CRITICAL |
| P0-04 | PD-V204-BB-04 | TRUE_PRODUCT_DECISION | CRITICAL |
| P0-06 | PD-V204-BB-05 | TRUE_PRODUCT_DECISION | NON_CRITICAL |
| P0-07 | PD-V204-AC-01 | TRUE_PRODUCT_DECISION | CRITICAL |

| Validation tally | Count |
|------------------|-------|
| TRUE_PRODUCT_DECISION | 6 |
| STALE_ALREADY_RESOLVED_BY_SPEC | 0 |
| IMPLEMENTATION_GAP (misclassified as product) | 0 |
| TEST_GAP | 0 |
| DOC_GAP | 0 |
| DEFERRED_NOT_A_BLOCKER | 0 |

Notes:

- Canonical PDF still uses both “unique within the church organization” and “unique within organization”; that conflict is **not** already resolved.
- Status **enums** are defined; **transition/actor matrices** are not → still a true product decision.
- `MUST IF CELLS` is a true scope decision; temporary defer is allowed because cells are unused and NON_CRITICAL for V2.04 claims.
- P0-05 (DR-39 injector) is **not** one of the six pure product P0s; product key freeze is appended as P1 (`PD-V204-BB-P1-01`) without promoting severity.

---

## Preserved approved / canonical decisions (do not reopen)

These remain in force from the BlessBoard V2.04 Canonical Feature Specification / Decision Register and existing ActiveClinic product notes. Listed for preservation only.

| Ref | Summary | Status |
|-----|---------|--------|
| Journey §4.2 | Church Directory → Select Church → Member Login / Activation | APPROVED |
| FR activation | Full Name + Phone + Church ID match; no self-create membership | APPROVED |
| Lost Church ID | No public automated recovery; church admin offline process | APPROVED |
| Membership statuses (values) | ACTIVE, INACTIVE, TRANSFERRED, FORMER, DECEASED (FOUNDATION values) | APPROVED (values only) |
| Membership/portal transitions | Normative matrix `docs/product/V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md` | TEMPORARY_APPROVED_FOR_V2_04 |
| Church ID uniqueness | Unique per `church_id` (not org-wide) | TEMPORARY_APPROVED_FOR_V2_04 |
| Multi-membership tenant bind | Select Church binds session; no in-app switcher | TEMPORARY_APPROVED_FOR_V2_04 |
| Password recovery | Verified phone OTP only; no email fallback | TEMPORARY_APPROVED_FOR_V2_04 |
| AC V2.04 contract | Presentation/editor gated; patient FOUNDATION/non-gated | TEMPORARY_APPROVED_FOR_V2_04 |
| Portal access statuses (values) | NOT_ACTIVATED, ACTIVE, BLOCKED | APPROVED (values only) |
| Request statuses (values) | PENDING, APPROVED, REJECTED, CANCELLED | APPROVED (values only) |
| Membership ≠ portal access | Separate concepts; block preserves history | APPROVED |
| DR-28 data | Multi-membership data model FOUNDATION; selection UX deferred for full product | APPROVED_FOUNDATION |
| Prefer archive over hard delete | Ordinary hard delete not normal lifecycle | APPROVED |
| Transfer to unrelated church | New membership; no automatic private-data move | APPROVED |
| Cell attendance (conditional) | Cell leaders scoped to cells/events they manage — **only if cells ship** | CONDITIONAL (`MUST IF CELLS`) |
| PD-AC-01 | P01 Stitch titles canonical; unprefixed = DUPLICATE | APPROVED (AC Stitch) |
| PD-AC-02 | Utilitarian admin UI allowed without Stitch MATCHED claim | APPROVED (AC Stitch) |
| PD-AC-03 | Facility-scoped invite as current behavior | APPROVED (AC Stitch) |
| PD-AC-04 | Clinical roles after schemas; do not fake clinical nav | APPROVED (AC Stitch) |
| PD-AC-07 | Offline presentational / retry only | APPROVED (AC Stitch) |
| PD-AC-09 | Copyable + WhatsApp/mailto until providers chosen | APPROVED (AC Stitch) |
| PD-AC-10 | Defer feature-lock screens until commercial packaging | APPROVED (AC Stitch) |

---

## P0 decisions (validated)

### PD-V204-BB-01

```
DECISION_ID: PD-V204-BB-01
PRODUCT: BB
RELATED_REQ: FR-02 / BR-01 / DR-1 / P0-01
PRIORITY: P0
TITLE: Church ID uniqueness scope
CRITICALITY: CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - Church ID is church-controlled; member cannot edit it.
  - Duplicate Church ID is hard-blocked; not globally unique across BlessBoard.
  - Canonical text says both “unique within the church organization” and
    “Church ID is unique within organization”.
  - Implementation today: unique on (church_id, lower(trim(member_number))).
EXACT_UNRESOLVED_QUESTION:
  Is Church ID unique per church (campus / church_id) or per organization
  (organization_id) for multi-church orgs?
WHY_DECISION_IS_REQUIRED:
  Import, activation lookup, isolation acceptance, and DR-28 login rules
  diverge if scope is wrong; identity/tenant integrity.
OPTIONS:
  OPTION A:
    BEHAVIOR: Unique per church_id (campus). Same member_number allowed in
      different churches under one org.
    ADVANTAGES: Matches shipped unique index and current activation paths;
      fits Directory → Select Church journey.
    RISKS: Same Church ID string can exist in sibling campuses; ops must
      always select church first.
    IMPLEMENTATION_IMPACT: None (already implemented); update FR-02/BR-01 wording.
  OPTION B:
    BEHAVIOR: Unique per organization_id across all churches in the org.
    ADVANTAGES: One Church ID string per org; simpler “ID alone” mental model.
    RISKS: Collision on import across campuses; requires migration and index
      change; may break existing multi-campus data.
    IMPLEMENTATION_IMPACT: Schema/index migration; import/activation/query
      changes; regression of uniqueness tests.
RECOMMENDED_OPTION: A
REASON: Aligns with shipped enforcement and Select Church journey; lowest
  integrity risk for V2.04 closeout.
RECOMMENDED_DECISION: Unique per church_id; rewrite FR-02/BR-01 to that wording.
TEMPORARY_DECISION: N/A
RATIONALE: CRITICAL — must not silently ship org-scoped uniqueness without
  Product approval; recommendation is A for review.
IMPLEMENTATION_IMPACT: Doc/spec alignment if A; migration if B.
TEST_IMPACT: T-M03 / uniqueness ACs freeze to chosen scope.
APPROVED_OPTION: OPTION A — unique per church_id
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
APPROVAL_RATIONALE: Product approved temporary V2.04 freeze; sibling churches may share Church ID strings; Select Church required before resolve.
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

### PD-V204-BB-02

```
DECISION_ID: PD-V204-BB-02
PRODUCT: BB
RELATED_REQ: Login journey §4.2 / DR-28 / P0-02
PRIORITY: P0
TITLE: Multi-membership login / activation tenant context
CRITICALITY: CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - Journey: BlessBoard.com → Church Directory → Select Church → Login/Activation.
  - Returning login: Church ID + password (case-insensitive Church ID after normalize).
  - DR-28: data model MAY allow multiple independently scoped memberships (FOUNDATION).
  - Full multi-membership selection UX is deferred in Decision Register.
EXACT_UNRESOLVED_QUESTION:
  When a person has multiple memberships, what authoritatively binds church /
  tenant context for activation and login sessions?
WHY_DECISION_IS_REQUIRED:
  Wrong binding → wrong membership activated / cross-tenant session mix-up.
OPTIONS:
  OPTION A:
    BEHAVIOR: Church Directory “Select Church” is authoritative session tenant
      for that login/activation; Church ID is resolved only inside that church.
      Multi-church switcher UX remains deferred (re-enter via Directory).
    ADVANTAGES: Matches published journey; compatible with uniqueness Option A;
      no new switcher UI for V2.04.
    RISKS: Users with multi-membership must re-select church to switch context.
    IMPLEMENTATION_IMPACT: Document + assert session.churchId from Directory
      selection; close FOUNDATION UX as out of V2.04 claims.
  OPTION B:
    BEHAVIOR: After auth, present membership picker when >1 membership exists;
      picker sets tenant.
    ADVANTAGES: Clearer multi-membership UX.
    RISKS: New MUST surface; expands FOUNDATION into release scope; more QA.
    IMPLEMENTATION_IMPACT: New picker UI + session rebind + automated/manual packs.
  OPTION C:
    BEHAVIOR: Church ID unique per org so ID+password alone selects membership
      without church selection (Directory optional).
    ADVANTAGES: Simpler credential-only login.
    RISKS: Contradicts published Directory journey; couples to uniqueness Option B;
      higher identity risk if IDs collide historically.
    IMPLEMENTATION_IMPACT: Journey rewrite; depends on PD-V204-BB-01 = B.
RECOMMENDED_OPTION: A
REASON: Already implied by §4.2; keeps FOUNDATION UX deferred; lowest security
  expansion for V2.04.
RECOMMENDED_DECISION: Directory selection = session tenant; document interaction
  with Church ID; defer switcher.
TEMPORARY_DECISION: N/A
RATIONALE: CRITICAL identity/tenant — Product must affirm A (or choose B/C).
IMPLEMENTATION_IMPACT: Spec appendix + session assertions if A; larger if B/C.
TEST_IMPACT: Multi-membership login/activation cases AFTER_SPEC.
APPROVED_OPTION: OPTION A — Directory Select Church binds session tenant
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
APPROVAL_RATIONALE: Product approved; no in-app multi-membership switcher in V2.04.
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

### PD-V204-BB-03

```
DECISION_ID: PD-V204-BB-03
PRODUCT: BB
RELATED_REQ: FR-06 / AC-07 / DR-10 / P0-03
PRIORITY: P0
TITLE: Password recovery email fallback criteria
CRITICALITY: CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - Forgot Password is mandatory.
  - Normal flow: Church ID → locate membership → verify via registered phone OTP,
    with “email fallback where available” → set new password.
  - Offline church admin recovery if member loses recovery contact.
  - Implementation today: phone OTP only (PARTIAL vs literal email phrase).
EXACT_UNRESOLVED_QUESTION:
  What does “email fallback where available” mean for V2.04 — phone-only,
  verified-email OTP when no phone, or any email on file?
WHY_DECISION_IS_REQUIRED:
  Account takeover vs lockout; security of recovery; cannot pass/fail FR-06 MUST.
OPTIONS:
  OPTION A:
    BEHAVIOR: Phone OTP only for V2.04; email phrase treated as future/FOUNDATION;
      offline admin path remains for no-phone cases.
    ADVANTAGES: Matches current implementation; no new recovery channel attack surface.
    RISKS: Members without usable phone rely on church admin (already in spec).
    IMPLEMENTATION_IMPACT: Spec clarification only; no email OTP code.
  OPTION B:
    BEHAVIOR: If no usable phone, allow OTP to verified email only; never unverified.
    ADVANTAGES: Self-service recovery for phone-less members.
    RISKS: Email channel correctness, verified-flag integrity, rate limits, phishing.
    IMPLEMENTATION_IMPACT: Email OTP channel + tests + ops config (P1 impl after decide).
  OPTION C:
    BEHAVIOR: Any email on file may receive recovery OTP.
    ADVANTAGES: Maximum recovery coverage.
    RISKS: High account-takeover risk; rejected for security.
    IMPLEMENTATION_IMPACT: Same as B plus weaker verification rules — not recommended.
RECOMMENDED_OPTION: A
REASON: Conservative security for V2.04; offline admin already covers contact loss;
  avoids inventing verified-email guarantees under time pressure.
RECOMMENDED_DECISION: Phone-only V2.04; document email fallback as post-V2.04 /
  FOUNDATION unless Product picks B.
TEMPORARY_DECISION: N/A
RATIONALE: CRITICAL security — do not implement B/C until approved.
IMPLEMENTATION_IMPACT: Docs if A; email OTP stack if B.
TEST_IMPACT: T-M05 freezes to phone-only (A) or email path (B).
APPROVED_OPTION: OPTION A — phone OTP only; no email recovery in V2.04
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
APPROVAL_RATIONALE: Product approved; offline church admin for missing recovery contact; never unverified email OTP.
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

### PD-V204-BB-04

```
DECISION_ID: PD-V204-BB-04
PRODUCT: BB
RELATED_REQ: Membership/Portal statuses / checklist / P0-04
PRIORITY: P0
TITLE: Membership and portal status transition matrices
CRITICALITY: CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - Membership values: ACTIVE, INACTIVE, TRANSFERRED, FORMER, DECEASED (FOUNDATION).
  - Portal values: NOT_ACTIVATED, ACTIVE, BLOCKED.
  - Authorized Pastor/Admin can block/unblock portal without deleting membership.
  - Blocking preserves membership, attendance, requests, history.
  - Prefer archive/status over ordinary hard delete.
  - Enums implemented; transition WHO/WHEN matrix missing.
EXACT_UNRESOLVED_QUESTION:
  Which actors may move which membership and portal statuses, under what
  preconditions (especially INACTIVE/FORMER/BLOCKED ↔ ACTIVE)?
WHY_DECISION_IS_REQUIRED:
  Authorization, irreversible lifecycle, and auditability of access/membership.
OPTIONS:
  OPTION A:
    BEHAVIOR: Publish a minimal V2.04 matrix:
      - Portal BLOCKED↔ACTIVE: Pastor/Admin with block permission only;
        block/unblock invalidate relevant sessions.
      - Membership ACTIVE↔INACTIVE: Pastor/Admin with member-update permission.
      - FORMER / TRANSFERRED / DECEASED: Pastor/Admin only; no member self-service;
        DECEASED/FORMER not self-reactivatable without admin.
      - NOT_ACTIVATED → portal ACTIVE only via successful activation.
    ADVANTAGES: Testable MUST; closes release gate without freezing every edge.
    RISKS: May need later refinement for org policy variance.
    IMPLEMENTATION_IMPACT: Align guards to matrix; fill gaps where code is looser.
  OPTION B:
    BEHAVIOR: Declare current production transition behavior normative for V2.04;
      document as-is inventory as the matrix.
    ADVANTAGES: Fast close if Product accepts code-as-spec.
    RISKS: Codifies accidental behavior; harder to challenge later.
    IMPLEMENTATION_IMPACT: Documentation + characterization tests.
  OPTION C:
    BEHAVIOR: Defer full matrix; only certify block/unblock + activation paths;
      mark other transitions FOUNDATION.
    ADVANTAGES: Narrows V2.04 claims.
    RISKS: Leaves membership lifecycle ACs incomplete for FEATURE QA.
    IMPLEMENTATION_IMPACT: Scope notes; limited tests.
RECOMMENDED_OPTION: A
REASON: Explicit actor rules are needed for authorization/audit; A is the
  smallest complete matrix that unblocks QA without freezing code accidents.
RECOMMENDED_DECISION: Adopt Option A matrix; Product edits any cell before freeze.
TEMPORARY_DECISION: N/A
RATIONALE: CRITICAL — Product must approve matrix contents before enforcement claims.
IMPLEMENTATION_IMPACT: Permission checks + status service alignment after approval.
TEST_IMPACT: Transition positive/negative cases AFTER_SPEC.
APPROVED_OPTION: OPTION A — minimal transition matrix (see V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md)
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
APPROVAL_RATIONALE: Product approved; enforce transitions + clear ordinary portal on non-active membership; audit required.
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

### PD-V204-BB-05

```
DECISION_ID: PD-V204-BB-05
PRODUCT: BB
RELATED_REQ: DR-46 / P0-06
PRIORITY: P0
TITLE: Cells in V2.04 scope (MUST IF CELLS)
CRITICALITY: NON_CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - Spec marks cell-leader attendance scope as MUST IF CELLS.
  - Cell scope currently ABSENT / UNVERIFIABLE in implementation audits.
  - Conditional MUST is inactive when cells are not a shipped capability.
EXACT_UNRESOLVED_QUESTION:
  Are cells in V2.04 release scope (ship mini-spec + enforcement) or deferred?
WHY_DECISION_IS_REQUIRED:
  Conditional MUST cannot be tested or claimed until scope is explicit.
OPTIONS: N/A (non-critical — temporary default applied)
RECOMMENDED_DECISION: DEFER cells for V2.04; no cell attendance/scope claims in
  release notes; reclassify DR-46 as OUT_OF_SCOPE / FOUNDATION until cells ship.
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04 — DEFER cells
RATIONALE: Most conservative practical default: do not claim or test unused
  conditional MUST; preserves full cell product review for a later wave.
IMPLEMENTATION_IMPACT: None required beyond scope docs / release notes hygiene.
  Engineering may proceed.
TEST_IMPACT: Cell attendance/scope tests OUT_OF_SCOPE for V2.04.
REVIEW_LATER: YES
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

### PD-V204-AC-01

```
DECISION_ID: PD-V204-AC-01
PRODUCT: AC
RELATED_REQ: AC V2.04 contract / P0-07
PRIORITY: P0
TITLE: ActiveClinic V2.04 product contract scope
CRITICALITY: CRITICAL
VALIDATION_CLASS: TRUE_PRODUCT_DECISION
WHAT_IS_ALREADY_DEFINED:
  - No AC Canonical Feature Spec in-repo (SPEC_NOT_FOUND).
  - Website/editor foundation implemented; public/editor SANITY_PASS.
  - Patient domain foundation implemented; patient NOT_SANITY_TESTED as product pack.
  - Inventing ACs without Product contract is forbidden by QA process.
  - Existing Stitch product decisions (PD-AC-01..10) cover wave blockers, not a
    full FR/AC/BR contract.
EXACT_UNRESOLVED_QUESTION:
  For V2.04, must Product author a Canonical AC Feature Spec that gates release,
  or is Stitch/website presentation-only and patient foundation explicitly
  non-release-gated?
WHY_DECISION_IS_REQUIRED:
  Without a contract, AC product intent cannot be objectively gated; privacy/PHI
  and patient ACs remain undefined for release claims.
OPTIONS:
  OPTION A:
    BEHAVIOR: Author AC Canonical Feature Spec (FR/AC/BR) before AC release claims.
    ADVANTAGES: Objective gating; unblocks PHI/Stitch/patient ACs properly.
    RISKS: Schedule cost; may delay V2.04 if AC remains release-gated.
    IMPLEMENTATION_IMPACT: Spec authoring; map impl to FRs; FEATURE QA packs.
  OPTION B:
    BEHAVIOR: Declare public website/editor presentation-only for V2.04;
      patient foundation explicitly non-release-gated; no AC product MUST claims
      beyond already SANITY_PASS presentation smoke.
    ADVANTAGES: Unblocks BB-focused V2.04 closeout; honest scope.
    RISKS: AC product marketing must not overclaim; patient remains FOUNDATION.
    IMPLEMENTATION_IMPACT: Scope waiver note; AC P1 items stay non-gating until spec.
  OPTION C:
    BEHAVIOR: Gate only website presentation; still require minimal patient AC list
      before any patient UI claims.
    ADVANTAGES: Middle path for patient honesty.
    RISKS: Partial contract still blocks patient FEATURE QA.
    IMPLEMENTATION_IMPACT: Short patient AC list + limited pack.
RECOMMENDED_OPTION: B
REASON: Matches current evidence (website sanity, patient foundation, no FR pack);
  avoids inventing ACs; keeps privacy-sensitive patient claims out of V2.04 gate.
RECOMMENDED_DECISION: Option B waiver for V2.04 release gating; Option A remains
  required before AC is sold/claimed as a completed product module.
TEMPORARY_DECISION: N/A
RATIONALE: CRITICAL privacy/release-gating — Product must approve waiver or spec.
IMPLEMENTATION_IMPACT: Release notes / gate docs if B; full AC spec program if A.
TEST_IMPACT: AC patient FEATURE packs non-gated if B; required if A/C.
APPROVED_OPTION: OPTION B — AC presentation/editor release-gated; patient FOUNDATION/non-release-gated
TEMPORARY_DECISION: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
APPROVAL_RATIONALE: Product approved; full AC canonical contract is later work; do not claim patient FEATURE certification in V2.04.
STATUS: TEMPORARY_APPROVED_FOR_V2_04
```

---

## P1 / P2 unresolved decisions appended (severity not promoted)

Extracted from completed V2.04 audits / gap plan. Compact register entries. Wave-2 P1 rows TEMPORARY_APPROVED_FOR_V2_04 (2026-10-02). Not elevated to P0.

### P1

#### PD-V204-BB-P1-01

```
DECISION_ID: PD-V204-BB-P1-01
PRODUCT: BB
RELATED_REQ: FR-16 / AC-21 / DR-39 (product half of burndown P0-05)
PRIORITY: P1
TITLE: Leader ↔ managed resource binding model and permission keys
CRITICALITY: CRITICAL (authorization) — severity not promoted to P0 product freeze
APPROVED_OPTION: A
APPROVED_BEHAVIOR: Managed resources = ministry/department scope_ids from active ministry_leader / department_head assignments; broad review = events.manage (JOIN_PERMISSION.REVIEW_BROAD); unmanaged deny; cells deferred (PD-V204-BB-05)
NORMATIVE_KEYS: ministry_leader@ministry, department_head@department; REVIEW_BROAD=events.manage
IMPLEMENTATION_IMPACT: resolveManagedJoinResourceIds wired at join-request mount
TEST_IMPACT: T-A06 / Wave2 focused suite
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-BB-P1-02

```
DECISION_ID: PD-V204-BB-P1-02
PRODUCT: BB
RELATED_REQ: FR-12 / AC-13 / DR-27
PRIORITY: P1
TITLE: Dual-role Member Portal + Church Management destinations
CRITICALITY: NON_CRITICAL relative to authz core; HIGH completeness gap
APPROVED_BEHAVIOR: Same identity; existing Member Portal shell + Church Management shell; bidirectional nav only when corresponding permission present; no new shell/auth model
DESTINATIONS: /member ↔ /hq
IMPLEMENTATION_IMPACT: dualRoleShellNav + member/hq shell locals
TEST_IMPACT: Dual-role Wave2 focused
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-BB-P1-03

```
DECISION_ID: PD-V204-BB-P1-03
PRODUCT: BB
RELATED_REQ: DR-51
PRIORITY: P1
TITLE: “Relevant” sessions invalidated on block/password reset (dual-role)
CRITICALITY: CRITICAL (session security) — not promoted
APPROVED_OPTION: A
APPROVED_BEHAVIOR: Member block/password reset revokes all church-scoped deployment sessions for that BlessBoard userId (member + church-management); Platform Admin sessions remain separate (platform_identity); deny lingering access by default
IMPLEMENTATION_IMPACT: revokeSessionsByBlessBoardUser on block + password reset
TEST_IMPACT: Wave2 focused revoke proofs
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-BB-P1-04

```
DECISION_ID: PD-V204-BB-P1-04
PRODUCT: BB
RELATED_REQ: DR-52
PRIORITY: P1
TITLE: Rate-limit thresholds
CRITICALITY: NON_CRITICAL (ops/security hardening) — not promoted
APPROVED_BEHAVIOR: V2.04 temporary freeze — 8 attempts / 15 minutes per existing bucket; neutral message “Too many attempts. Try again later.”
IMPLEMENTATION_IMPACT: DOC freeze of RATE_MAX=8 / RATE_WINDOW_MS=15min (no code change required)
TEST_IMPACT: Wave2 rate-limit asserts
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-BB-P1-05

```
DECISION_ID: PD-V204-BB-P1-05
PRODUCT: BB
RELATED_REQ: DR-55
PRIORITY: P1
TITLE: Platform Admin cross-tenant membership interventions
CRITICALITY: CRITICAL (cross-tenant / audit) — not promoted
APPROVED_OPTION: A
APPROVED_BEHAVIOR: Deny by default; V2.04 intervention allowlist empty; PA does not auto-gain church membership powers; future actions require explicit allowlist + audit; support uses in-tenant admin/out-of-band for V2.04
IMPLEMENTATION_IMPACT: Legacy /admin/church/members/* mutate routes deny + audit
TEST_IMPACT: Wave2 PA deny proofs
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-AC-P1-01

```
DECISION_ID: PD-V204-AC-P1-01
PRODUCT: AC
RELATED_REQ: Stitch matrix (under PD-V204-AC-01)
PRIORITY: P1
TITLE: MUST vs PRESENTATION vs FUTURE controls
CRITICALITY: Depends on PD-V204-AC-01 — not promoted
APPROVED_MATRIX:
  - website/editor/presentation track = PRESENTATION
  - patient functionality = non-release-gated FOUNDATION
  - unimplemented items = FUTURE
  - invent no new MUST requirements
IMPLEMENTATION_IMPACT: Documentation / claim matrix only
TEST_IMPACT: Doc assert in Wave2 suite
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-AC-P1-02

```
DECISION_ID: PD-V204-AC-P1-02
PRODUCT: AC
RELATED_REQ: Public PHI policy
PRIORITY: P1
TITLE: Public website field / PHI rules
CRITICALITY: CRITICAL (privacy) — not promoted
APPROVED_OPTION: A
APPROVED_BEHAVIOR: Allowlist-driven public-safe fields only (display name, title/role, specialty/department, approved public photo/bio, org-approved public contact/location). Forbid private staff contact, internal IDs, auth identifiers, employment/admin fields, clinical notes, patient data, PHI, and any non-allowlisted field.
IMPLEMENTATION_IMPACT: publicCatalogueFieldPolicy + visibility/adapter projection
TEST_IMPACT: Wave2 allowlist proofs
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

#### PD-V204-AC-P1-03

```
DECISION_ID: PD-V204-AC-P1-03
PRODUCT: AC
RELATED_REQ: R08 booking
PRIORITY: P1
TITLE: Booking entry chrome-only vs domain change
CRITICALITY: NON_CRITICAL — not promoted
APPROVED_BEHAVIOR: R08 is presentation/chrome/handoff only; reuse existing ActiveClinic booking domain; do not create second booking engine/domain
IMPLEMENTATION_IMPACT: None (affirm existing handoff)
TEST_IMPACT: Wave2 R08 handoff source proof
STATUS: TEMPORARY_APPROVED_FOR_V2_04
REVIEW_LATER: YES
```

### P2

| ID | PRODUCT | RELATED_REQ | TITLE | RECOMMENDED_DECISION | STATUS |
|----|---------|-------------|-------|----------------------|--------|
| PD-V204-BB-P2-01 | BB | FR-10 / DR-22 | Block reason required / visibility | Reason required + audit metadata appendix | OPEN |
| PD-V204-BB-P2-02 | BB | Requests | Who may CANCEL | Requester cancel while PENDING only | OPEN |
| PD-V204-BB-P2-03 | BB | FR-14 | QR TTL default/max / timezone | Document default/max in appendix | OPEN |
| PD-V204-BB-P2-04 | BB | Attendance session | draft/open/closed/locked lifecycle | Mini-spec or mark FOUNDATION transitions | OPEN |
| PD-V204-BB-P2-05 | BB | Wrong-branch QR | Accept vs reject | Product decide flag vs reject | OPEN |
| PD-V204-BB-P2-06 | BB | DR-19 | Preferred worship location field | Defer field or preference-only | OPEN |
| PD-V204-BB-P2-07 | BB | DOB / name match | Dup warn + activation name composition | Clarify optional DOB + match string | OPEN |
| PD-V204-BB-P2-08 | BB | DR-2 | Church ID charset / length | Freeze charset/max length | OPEN |
| PD-V204-BB-P2-09 | BB | Exceptional delete | Who / when | Affirm no UI hard delete in V2.04 | OPEN |
| PD-V204-BB-P2-10 | BB | Idempotency | Create / activate / join double-submit | Spec intent; harden later | OPEN |
| PD-V204-BB-P2-11 | BB | FR-18 vs forms | Uploads vs form attachments | Clarify in privacy appendix | OPEN |
| PD-V204-BB-P2-12 | BB | Role bundles | Pastor/Secretary default entitlements | Publish role→permission matrix | OPEN |
| PD-V204-BB-P2-13 | BB | Audit metadata | Required reason/before/after | Mandate metadata table post-release hardening | OPEN |
| PD-V204-AC-P2-01 | AC | Patient AC list | Staff Add Patient acceptance pack | Publish list **or** keep non-gated (ties to AC-01) | OPEN |
| PD-V204-AC-P2-02 | AC | Facility websites | Still NOT SUPPORTED? | Reaffirm in AC V2.04 notes | OPEN |

Compact required fields for each P2 row above:

- **PRIORITY:** P2  
- **CRITICALITY:** not promoted; treat per gap plan MEDIUM (audit metadata historically HIGH→P2 if core audits exist)  
- **WHAT_IS_ALREADY_DEFINED / EXACT_UNRESOLVED_QUESTION / WHY / IMPACT:** as in `V2_04_FINAL_GAP_AND_TEST_PLAN.md` P2 table  
- **TEMPORARY_DECISION:** none applied in this extraction  
- **OPTIONS:** not expanded (non-P0)

---

## Extraction footer

```
P0_PRODUCT_ITEMS_INPUT=6
P0_PRODUCT_DECISIONS_REMAINING=0
WAVE2_P1_PRODUCT_DECISIONS_REMAINING=0
TEMPORARY_APPROVED_FOR_V2_04=14
REVIEW_LATER=YES
CRITICAL_APPROVED=5
NON_CRITICAL_APPROVED=1
FINAL=V2_04_PRODUCT_DECISIONS_APPLIED
```
