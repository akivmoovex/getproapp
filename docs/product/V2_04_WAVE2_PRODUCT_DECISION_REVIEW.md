# V2.04 Wave 2 — Product Decision Review

**Mode:** APPLIED (2026-10-02) — all eight Wave-2 decisions `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`.  
**Implementation:** CODE_CHANGE decisions wired + focused suite `tests/v2-04-wave2-product-decisions.test.js` (26/26).  
**Original review body retained below for audit trail.**

| ID | APPROVED | STATUS |
|----|----------|--------|
| PD-V204-BB-P1-01 | OPTION A | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-02 | Bidirectional shells | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-03 | OPTION A | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-04 | 8 / 15 min temporary | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-BB-P1-05 | OPTION A (empty allowlist) | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-01 | PRESENTATION / FOUNDATION / FUTURE matrix | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-02 | OPTION A allowlist | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| PD-V204-AC-P1-03 | R08 chrome/handoff only | TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |

**WAVE2_PRODUCT_REMAINING=0**

---

**Mode:** READ-ONLY (no code; no implementation).  
**Date:** 2026-10-02  
**Scope:** Exactly the **8** Wave 2 product decisions (`RB-PROD-01…08` / `PD-V204-*-P1-*`).  
**Sources:** `V2_04_RELEASE_BLOCKER_CLOSURE_QUEUE.md`, `V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md`, `V2_04_PRODUCT_DECISION_REGISTER.md`, `V2_04_FINAL_GAP_AND_TEST_PLAN.md`, `V2_04_SPEC_COMPLETENESS_GAP_AUDIT.md`, related BB join-request / portal-auth code contracts.

**Excluded:** Already `TEMPORARY_APPROVED_FOR_V2_04` P0 decisions (BB-01…05, AC-01); P2 register rows; test gaps; implementation bugs; Wave 1 closures.

---

## Compact summary

| ID | PRODUCT | QUESTION | CRITICALITY | RECOMMENDED | CONFIDENCE | CODE IMPACT |
|----|---------|----------|-------------|-------------|------------|-------------|
| PD-V204-BB-P1-01 | BB | Which leader↔resource binding keys define managed join-review scope? | CRITICAL | A — Ministry/dept assignment IDs + frozen permission keys | HIGH | YES |
| PD-V204-BB-P1-02 | BB | Confirm dual-role Member Portal + Church Mgmt destinations? | NON_CRITICAL | Linked bidirectional entry points (current shells) | HIGH | YES |
| PD-V204-BB-P1-03 | BB | Which sessions are “relevant” on block/password reset for dual-role? | CRITICAL | A — Revoke all church-scoped sessions for that userId | HIGH | YES |
| PD-V204-BB-P1-04 | BB | Exact rate-limit N/window for activation/login/recovery? | NON_CRITICAL | Freeze current **8 / 15 min** per bucket | HIGH | NO* |
| PD-V204-BB-P1-05 | BB | Catalogue of allowed Platform Admin cross-tenant membership actions? | CRITICAL | A — Deny-by-default; empty allowlist + audit for any future action | HIGH | DOC→code if PA actions exist |
| PD-V204-AC-P1-01 | AC | MUST vs PRESENTATION vs FUTURE Stitch controls? | NON_CRITICAL | Sign matrix; under AC-01 all non-patient Stitch = PRESENTATION unless listed MUST | HIGH | NO |
| PD-V204-AC-P1-02 | AC | Which doctor/services fields may appear on public pages? | CRITICAL | A — Public allowlist (name/title/specialty/public bio/photo; no private contact/PHI) | MEDIUM | YES |
| PD-V204-AC-P1-03 | AC | R08 booking chrome-only vs second booking domain? | NON_CRITICAL | Chrome/handoff only to inherited booking engine | HIGH | NO |

\*P1-04: DOC_ONLY if values match live defaults; CODE only if Product chooses different N/window.

---

## Decision details

### PD-V204-BB-P1-01

**DECISION_ID:** PD-V204-BB-P1-01  
**PRODUCT:** BB  
**AREA:** Join-request scoped review / leader↔resource binding  
**RELATED_BLOCKER:** RB-PROD-01 → RB-ENG-01  
**RELATED_REQUIREMENT:** FR-16 / AC-21 / DR-39 (Canonical Decision #39 / Completeness BLOCKING #5)  
**CURRENT_AMBIGUITY:** Scope helper + `assertResourceScopedReview` exist; production mount leaves `resolveManagedResourceIds` unwired; permission/resource key names for “managed ministry/department” are not frozen. Broader permission currently aliases `events.manage`.  
**WHY_IT_BLOCKS_RELEASE:** Without frozen keys, scoped leaders stay fail-closed or risk over-broad access; FINAL_GAP P0 scoped-review cannot close.

**CRITICALITY:** CRITICAL (authorization / RBAC)

#### Options

**OPTION A — Freeze ministry/department assignment binding (recommended)**  
**BEHAVIOR:** Managed resources = ministry/department IDs the actor is assigned as leader/manager. Broader review = explicit broad permission (keep/alias `events.manage` **or** rename to `requests.review` with alias). Injector returns those IDs; unmanaged targets deny.  
**ADVANTAGES:** Matches existing join types (`ministry` / `department`); unlocks RB-ENG-01 safely; testable (T-A06).  
**RISKS:** Cells still out (PD-V204-BB-05 DEFER) — cell leaders not in V2.04 scope (already approved).  
**IMPLEMENTATION_IMPACT:** Wire `resolveManagedResourceIds` from assignment tables; publish key constants in register.  
**TEST_IMPACT:** Mount-level T-A06 + T-M10.  
**BACKWARD_COMPATIBILITY:** Fail-closed leaders become able to review managed targets only — intended.

**OPTION B — Broad-only for V2.04 (no resource binding)**  
**BEHAVIOR:** Only actors with broad permission may review; scoped leaders stay fail-closed; document as V2.04 limitation.  
**ADVANTAGES:** Minimal code; no binding model.  
**RISKS:** MUST FR-16 scoped review incomplete; Product claim weaker.  
**IMPLEMENTATION_IMPACT:** Doc waiver + keep unwired injector.  
**TEST_IMPACT:** Negatives only; no positive scoped path.  
**BACKWARD_COMPATIBILITY:** High (status quo).

**OPTION C — Permission-key rename first, binding later**  
**BEHAVIOR:** Introduce `requests.review` / resource permissions without assignment entity freeze.  
**ADVANTAGES:** Cleaner permission vocabulary.  
**RISKS:** Still no ID binding → scoped review incomplete; double migration.  
**IMPLEMENTATION_IMPACT:** Permission rename + aliases.  
**TEST_IMPACT:** RBAC rename suites.  
**BACKWARD_COMPATIBILITY:** Medium (alias required).

**RECOMMENDED_OPTION:** A  
**CONFIDENCE:** HIGH  
**WHY:** Aligns with existing join target types and Completeness audit; cells already deferred; unlocks P0 eng without inventing new domains.

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | YES |
| TEST_CHANGE_REQUIRED | YES |
| DOC_ONLY | NO |
| MIGRATION_REQUIRED | NO (assignment reads; no new uniqueness schema assumed) |

---

### PD-V204-BB-P1-02

**DECISION_ID:** PD-V204-BB-P1-02  
**PRODUCT:** BB  
**AREA:** Dual-role destinations (Member Portal + Church Management)  
**RELATED_BLOCKER:** RB-PROD-02 → RB-ENG-02  
**RELATED_REQUIREMENT:** FR-12 / AC-13 / DR-27  
**CURRENT_AMBIGUITY:** Shells exist; no Product-confirmed linked entry points / copy.  
**WHY_IT_BLOCKS_RELEASE:** FINAL_GAP P0 dual-role MUST experience incomplete until destinations confirmed and linked.

**CRITICALITY:** NON_CRITICAL (UX / completeness; same userId already carries both capabilities under temporary P0 auth decisions)

**TEMPORARY_APPROVAL_RECOMMENDED:** YES  

**Safest practical V2.04 default:** Bidirectional deep-links between Member Portal home and Church Management (HQ) entry for users with both membership + management permissions; one shared identity (no second login); copy labels “Member portal” / “Church management” only — no new shells.

**Why Engineering can proceed:** Destinations are composition of existing routes; no authz model change; temporary approve default destinations while Product may refine labels later (`REVIEW_LATER`).

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | YES |
| TEST_CHANGE_REQUIRED | YES |
| DOC_ONLY | NO |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-BB-P1-03

**DECISION_ID:** PD-V204-BB-P1-03  
**PRODUCT:** BB  
**AREA:** Session invalidation on block / password reset (dual-role)  
**RELATED_BLOCKER:** RB-PROD-03  
**RELATED_REQUIREMENT:** DR-51 (Canonical Decision #51)  
**CURRENT_AMBIGUITY:** Member revoke paths exist; which session classes for dual-role (member vs admin vs both) are undefined.  
**WHY_IT_BLOCKS_RELEASE:** Incomplete revoke → lingering admin/member access after block/reset — session security claim incomplete.

**CRITICALITY:** CRITICAL (authentication / session security)

#### Options

**OPTION A — Revoke all church-scoped sessions for that userId (recommended)**  
**BEHAVIOR:** On membership block or password reset, invalidate all BlessBoard sessions tied to that auth identity for the church/org (member portal + management). Platform Admin sessions unchanged.  
**ADVANTAGES:** Safest; simple rule; closes dual-role linger risk.  
**RISKS:** Admin mid-task kicked on member password reset — acceptable security tradeoff.  
**IMPLEMENTATION_IMPACT:** Classify session store by userId + church/org; revoke-all on block/reset.  
**TEST_IMPACT:** Dual-role block/reset manual + automated revoke assert.  
**BACKWARD_COMPATIBILITY:** Stricter than member-only revoke if that existed.

**OPTION B — Revoke member-portal sessions only**  
**BEHAVIOR:** Management sessions survive member block/reset.  
**ADVANTAGES:** Less disruptive for staff who are also members.  
**RISKS:** Blocked member still holds admin cookie — security hole.  
**IMPLEMENTATION_IMPACT:** Class-filtered revoke.  
**TEST_IMPACT:** Prove admin session survives (and Product accepts risk).  
**BACKWARD_COMPATIBILITY:** High if current is member-only.

**OPTION C — Revoke member + management, but allow “trusted device” admin retain**  
**BEHAVIOR:** Optional retain flag for management sessions.  
**ADVANTAGES:** Ops convenience.  
**RISKS:** Complex; easy to misconfigure; not V2.04-minimal.  
**IMPLEMENTATION_IMPACT:** New session metadata.  
**TEST_IMPACT:** Large.  
**BACKWARD_COMPATIBILITY:** New behavior.

**RECOMMENDED_OPTION:** A  
**CONFIDENCE:** HIGH  
**WHY:** Matches Completeness audit recommendation; deny linger by default.

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | YES |
| TEST_CHANGE_REQUIRED | YES |
| DOC_ONLY | NO |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-BB-P1-04

**DECISION_ID:** PD-V204-BB-P1-04  
**PRODUCT:** BB  
**AREA:** Rate-limit thresholds (activation / login / recovery)  
**RELATED_BLOCKER:** RB-PROD-04  
**RELATED_REQUIREMENT:** DR-52 (Canonical Decision #52)  
**CURRENT_AMBIGUITY:** Buckets implemented; contract lacks frozen N/window. Live portal auth uses **RATE_MAX=8**, **RATE_WINDOW_MS=15×60×1000**.  
**WHY_IT_BLOCKS_RELEASE:** Cannot certify rate-limit acceptance criteria / lockout UX without published numbers.

**CRITICALITY:** NON_CRITICAL (ops freeze of existing security control; not a new auth model)

**TEMPORARY_APPROVAL_RECOMMENDED:** YES  

**Safest practical V2.04 default:** Normative freeze: **8 attempts / 15 minutes** per rate bucket key (as implemented in `blessBoardMemberPortalAuthService`); UX message remains neutral “Too many attempts. Try again later.”

**Why Engineering can proceed:** Implementation already matches; decision is documentation + spot-check — no behavior change unless Product picks different values later (`REVIEW_LATER`).

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | NO (if freeze current) |
| TEST_CHANGE_REQUIRED | YES (assert documented N/window) |
| DOC_ONLY | YES (if freeze current) |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-BB-P1-05

**DECISION_ID:** PD-V204-BB-P1-05  
**PRODUCT:** BB  
**AREA:** Platform Admin cross-tenant membership interventions  
**RELATED_BLOCKER:** RB-PROD-05  
**RELATED_REQUIREMENT:** DR-55 (Canonical Decision #55)  
**CURRENT_AMBIGUITY:** PA must not auto-become church member; allowed cross-tenant membership actions not catalogued.  
**WHY_IT_BLOCKS_RELEASE:** Cross-tenant isolation + security-relevant auditability incomplete without allowlist.

**CRITICALITY:** CRITICAL (tenant isolation / auditability)

#### Options

**OPTION A — Deny-by-default; empty membership-intervention allowlist for V2.04 (recommended)**  
**BEHAVIOR:** Platform Admin may not create/edit/block/activate church members across tenants in V2.04 product UI. Church-scoped admins operate inside tenant. Any future PA intervention requires explicit allowlist entry + mandatory audit.  
**ADVANTAGES:** Strong isolation; matches “PA does not auto-become member”; minimal surface.  
**RISKS:** Support must use in-tenant admin or ticketed out-of-band process.  
**IMPLEMENTATION_IMPACT:** Doc + negatives; remove/disable any accidental PA membership routes if present.  
**TEST_IMPACT:** Cross-tenant PA negative tests.  
**BACKWARD_COMPATIBILITY:** High if PA already cannot act.

**OPTION B — Allowlist: read-only support view + ticketed block only**  
**BEHAVIOR:** PA may view membership metadata and perform block/unblock with reason + audit; no create/activate.  
**ADVANTAGES:** Supportability.  
**RISKS:** Broader cross-tenant power; needs careful UI/audit.  
**IMPLEMENTATION_IMPACT:** PA action matrix + audit rows.  
**TEST_IMPACT:** Positive allowlist + deny others.  
**BACKWARD_COMPATIBILITY:** New powers.

**OPTION C — Full PA membership CRUD with audit**  
**BEHAVIOR:** PA can create/edit/block across tenants when authorized.  
**ADVANTAGES:** Max support flexibility.  
**RISKS:** High isolation risk; not V2.04-minimal.  
**IMPLEMENTATION_IMPACT:** Large.  
**TEST_IMPACT:** Large.  
**BACKWARD_COMPATIBILITY:** Expansive.

**RECOMMENDED_OPTION:** A  
**CONFIDENCE:** HIGH  
**WHY:** Least privilege; closes DR-55 without inventing support tooling mid-release.

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | YES if any PA membership mutation exists; else DOC + tests |
| TEST_CHANGE_REQUIRED | YES |
| DOC_ONLY | NO (catalogue is normative; negatives required) |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-AC-P1-01

**DECISION_ID:** PD-V204-AC-P1-01  
**PRODUCT:** AC  
**AREA:** Stitch control classification (MUST / PRESENTATION / FUTURE)  
**RELATED_BLOCKER:** RB-PROD-06  
**RELATED_REQUIREMENT:** Stitch matrix; constrained by **PD-V204-AC-01 OPTION B** (presentation/editor gated; patient non-gated)  
**CURRENT_AMBIGUITY:** Presentation shipped; which Stitch controls are MUST vs presentation-only vs FUTURE unsigned.  
**WHY_IT_BLOCKS_RELEASE:** Unsigned matrix risks false MUST blockers or overclaims on presentation hygiene.

**CRITICALITY:** NON_CRITICAL (documentation / claim hygiene under existing AC-01 temporary approval)

**TEMPORARY_APPROVAL_RECOMMENDED:** YES  

**Safest practical V2.04 default:** Product-signed matrix where: (1) website editor/presentation controls already in release audits = PRESENTATION (release-gated for presentation track); (2) patient Stitch = FOUNDATION / non-gated per AC-01; (3) anything not implemented = FUTURE. No new MUST controls invented.

**Why Engineering can proceed:** AC-01 already sets gating; matrix documents classification without expanding scope.

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | NO |
| TEST_CHANGE_REQUIRED | NO (AFTER_SPEC spot-checks optional) |
| DOC_ONLY | YES |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-AC-P1-02

**DECISION_ID:** PD-V204-AC-P1-02  
**PRODUCT:** AC  
**AREA:** Public website field / PHI hygiene  
**RELATED_BLOCKER:** RB-PROD-07 → RB-QA-05  
**RELATED_REQUIREMENT:** Public PHI policy (Completeness SECURITY ambiguity)  
**CURRENT_AMBIGUITY:** Public pages load; contract-level allowlist for doctor/services fields undefined.  
**WHY_IT_BLOCKS_RELEASE:** Privacy — cannot sign public clinic pages without public-safe field policy.

**CRITICALITY:** CRITICAL (privacy)

#### Options

**OPTION A — Explicit public allowlist (recommended)**  
**BEHAVIOR:** Public doctor/services may show: display name, professional title, specialty, public photo, public short bio, public clinic contact (org-level phone/email already designated public). **Forbidden on public:** patient identifiers, private staff personal phone/email not marked public, home address, government IDs, clinical notes, appointment PHI, internal staff notes.  
**ADVANTAGES:** Clear QA checklist; aligns with catalogue “public_title” patterns.  
**RISKS:** Some clinics may want richer bios — keep bio as explicitly public-curated field only.  
**IMPLEMENTATION_IMPACT:** Filter presentation/catalogue serializers; strip non-allowlisted fields.  
**TEST_IMPACT:** RB-QA-05 spot-check + optional automated assert absent fields.  
**BACKWARD_COMPATIBILITY:** May hide previously leaking fields (desired).

**OPTION B — Presentation-only waiver under AC-01**  
**BEHAVIOR:** Document that public field hygiene is PRESENTATION best-effort; no hard allowlist in V2.04.  
**ADVANTAGES:** Faster release.  
**RISKS:** Privacy residual; weak certification.  
**IMPLEMENTATION_IMPACT:** Doc only.  
**TEST_IMPACT:** Optional smoke.  
**BACKWARD_COMPATIBILITY:** High.

**OPTION C — Mirror staff directory (full profile minus credentials)**  
**BEHAVIOR:** Most staff profile fields public except passwords/IDs.  
**ADVANTAGES:** Richer marketing.  
**RISKS:** Easy PHI/PII overshare.  
**IMPLEMENTATION_IMPACT:** Broad exposure.  
**TEST_IMPACT:** Weaker privacy negatives.  
**BACKWARD_COMPATIBILITY:** Expansive.

**RECOMMENDED_OPTION:** A  
**CONFIDENCE:** MEDIUM  
**WHY:** Privacy-safe and testable; exact field names need Product sign-off against live catalogue columns (hence MEDIUM).

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | YES |
| TEST_CHANGE_REQUIRED | YES |
| DOC_ONLY | NO |
| MIGRATION_REQUIRED | NO |

---

### PD-V204-AC-P1-03

**DECISION_ID:** PD-V204-AC-P1-03  
**PRODUCT:** AC  
**AREA:** R08 booking entry scope  
**RELATED_BLOCKER:** RB-PROD-08  
**RELATED_REQUIREMENT:** R08 booking chrome vs domain  
**CURRENT_AMBIGUITY:** Whether Stitch R08 implies a second booking engine or chrome/handoff only.  
**WHY_IT_BLOCKS_RELEASE:** Mis-scope could spawn second booking domain mid-release.

**CRITICALITY:** NON_CRITICAL (scope clarification; inherited engine already exists)

**TEMPORARY_APPROVAL_RECOMMENDED:** YES  

**Safest practical V2.04 default:** Affirm **chrome/handoff only** — public/Stitch booking entry routes into the inherited ActiveClinic booking engine; no second booking domain, schema, or availability engine in V2.04.

**Why Engineering can proceed:** Default forbids new domain work; Product note unblocks smoke of existing entry.

| Flag | Value |
|------|-------|
| CODE_CHANGE_REQUIRED | NO |
| TEST_CHANGE_REQUIRED | YES (smoke booking entry only) |
| DOC_ONLY | YES |
| MIGRATION_REQUIRED | NO |

---

## Cross-cutting notes

1. **Do not reopen** PD-V204-BB-01…05 or PD-V204-AC-01 (`TEMPORARY_APPROVED_FOR_V2_04`).  
2. **CREATE-UI gender/baptism** (RB-ENG-05) is a Wave-3 eng gate with informal Product confirm — **not** one of these 8 register IDs; keep out of this pack unless Product adds a PD.  
3. Cells remain **deferred** (BB-05); do not bind cell resources under BB-P1-01 Option A.  
4. After Product signs this pack, update `V2_04_PRODUCT_DECISION_REGISTER.md` statuses and unlock Wave 3 eng (RB-ENG-01/02) + RB-QA-05.

---

```
WAVE2_PRODUCT_DECISIONS=8
CRITICAL=4
NON_CRITICAL=4
HIGH_CONFIDENCE=7
MEDIUM_CONFIDENCE=1
LOW_CONFIDENCE=0
CODE_CHANGES_REQUIRED=5
TEST_CHANGES_REQUIRED=7
DOC_ONLY=3
MIGRATIONS_REQUIRED=0
FINAL=V2_04_WAVE2_PRODUCT_DECISIONS_READY
```
