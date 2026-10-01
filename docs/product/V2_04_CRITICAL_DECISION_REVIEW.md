# V2.04 Critical Decision Review (Product Prep)

**Purpose:** Prepare the five CRITICAL P0 product decisions for Product approval.  
**Status:** All five CRITICAL decisions + PD-V204-BB-05 are **TEMPORARY_APPROVED_FOR_V2_04** (`REVIEW_LATER=YES`). See register.  
**Sources:** `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md` and the specs/audits each decision already cites (BB Canonical Feature Spec FINAL; `V2_04_P0_BURNDOWN.md`; `V2_04_FINAL_GAP_AND_TEST_PLAN.md`; `V2_04_SPEC_COMPLETENESS_GAP_AUDIT.md`; `V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT.md`; AC Stitch product decisions where AC-01 references them).  
**Out of scope:** Application code changes; broad rediscovery; inventing additional critical decisions.  
**Preserved non-critical:** `PD-V204-BB-05` (cells DEFER) remains `TEMPORARY_APPROVED_FOR_V2_04` — not revisited here.

---

## Compact review table

| ID | PRODUCT | QUESTION | OPTION A | OPTION B | OPTION C | RECOMMENDED | CONFIDENCE |
|----|---------|----------|----------|----------|----------|-------------|------------|
| PD-V204-BB-01 | BB | Church ID unique per church or per org? | Per `church_id` | Per `organization_id` | — | **A** | HIGH |
| PD-V204-BB-02 | BB | Multi-membership tenant binding? | Directory selection = session tenant | Post-auth membership picker | Org-unique ID; Directory optional | **A** | HIGH |
| PD-V204-BB-03 | BB | Recovery email “where available”? | Phone-only V2.04 | Verified-email OTP if no phone | Any email on file | **A** | HIGH |
| PD-V204-BB-04 | BB | Status transition matrices? | Publish minimal actor matrix | Code-as-spec freeze | Certify block/activation only; rest FOUNDATION | **A** | MEDIUM |
| PD-V204-AC-01 | AC | AC V2.04 contract? | Author Canonical Spec (gate) | Presentation + patient non-gated | Gate website; require patient AC list | **B** | MEDIUM |

---

## PD-V204-BB-01 — Church ID uniqueness

### 1. Header

| Field | Value |
|-------|--------|
| **DECISION_ID** | PD-V204-BB-01 |
| **PRODUCT** | BB |
| **RELATED_REQUIREMENT** | FR-02 / BR-01 / DR-1 / P0-01 |
| **TITLE** | Church ID uniqueness scope |
| **CURRENT_AMBIGUITY** | Canonical text says both “unique within the **church organization**” and “unique within **organization**”; Product has not frozen per-`church_id` vs per-`organization_id`. |

### 2. Established facts

**Canonical spec**

- Church ID is church-controlled; member cannot edit it.
- Duplicate Church ID is hard-blocked; Church ID is not globally unique across BlessBoard.
- Wording conflict: “church organization” vs “organization” (Spec Completeness BLOCKING #1).

**Current implementation**

- Unique index on `(church_id, lower(trim(member_number)))` (Spec Implementation / gap plan: FULL at church scope).
- Domain uniqueness tests COVERED; FEATURE sanity for freeze NOT_SANITY_TESTED pending decision (T-M03).

**Audit findings**

- Gap plan / burndown: BLOCKING_DECISION; code is per-`church_id`; cannot freeze import/activation/isolation ACs until Product chooses.
- Note: one implementation-audit row labels FR-02 “org-scoped” in prose while citing the `church_id` index — treat the **index** as authoritative implementation fact.

### 3. Options

**OPTION A**

| | |
|--|--|
| **BEHAVIOR** | Church ID unique per `church_id` (campus). Same string may exist in sibling churches under one org. |
| **ADVANTAGES** | Matches shipped index and activation paths; fits Directory → Select Church journey; no data rewrite. |
| **RISKS** | Ops must always select church first; same ID string across campuses can confuse humans. |
| **DATA_MODEL_IMPACT** | None (keep current unique constraint). |
| **SECURITY/PRIVACY_IMPACT** | Tenant lookup must include church context; reduces false org-wide collisions. |
| **BACKWARD_COMPATIBILITY** | Full — already live behavior. |
| **IMPLEMENTATION_EFFORT** | LOW (spec wording alignment only). |
| **TEST_IMPACT** | Freeze T-M03 to per-church hard-block; allow same number in two churches of one org. |

**OPTION B**

| | |
|--|--|
| **BEHAVIOR** | Church ID unique per `organization_id` across all churches in the org. |
| **ADVANTAGES** | One ID string per org; simpler mental model if Directory were optional. |
| **RISKS** | False collisions across campuses; breaks existing multi-campus duplicate strings. |
| **DATA_MODEL_IMPACT** | Replace uniqueness with org-scoped constraint; detect/resolve collisions. |
| **SECURITY/PRIVACY_IMPACT** | Stronger org-wide uniqueness; login may over-rely on ID alone if Directory weakened. |
| **BACKWARD_COMPATIBILITY** | Breaking for any org that already has the same member_number in two churches. |
| **IMPLEMENTATION_EFFORT** | HIGH (migration + import/activation/query changes). |
| **TEST_IMPACT** | Rewrite uniqueness suites; migration verification; import collision cases. |

### 4–6. Recommendation

| | |
|--|--|
| **RECOMMENDED_OPTION** | **A** |
| **WHY** | Aligns with shipped enforcement and published Select Church journey; closes wording conflict without migration risk. |
| **CONFIDENCE** | **HIGH** |
| **Recommendation nature** | Closes canonical ambiguity; **changes canonical wording** (FR-02/BR-01) to “per church”; **no migration**; **no breaking API/schema** if A; **BB only**. |

---

## PD-V204-BB-02 — Multi-membership tenant binding

### 1. Header

| Field | Value |
|-------|--------|
| **DECISION_ID** | PD-V204-BB-02 |
| **PRODUCT** | BB |
| **RELATED_REQUIREMENT** | Login journey §4.2 / DR-28 / P0-02 |
| **TITLE** | Multi-membership login / activation tenant context |
| **CURRENT_AMBIGUITY** | MUST login uses Church ID after Select Church, while DR-28 FOUNDATION allows multiple memberships without stating how session tenant is bound. |

### 2. Established facts

**Canonical spec**

- Journey: Church Directory → Select Church → Member Login / First-time Activation.
- Returning login: Church ID + password (normalized, case-insensitive Church ID).
- DR-28: data model should permit multiple independently scoped church memberships (FOUNDATION); full selection UX deferred in Decision Register.

**Current implementation**

- Multiple membership rows possible (gap plan: FULL for data); multi-membership switcher UX DEFERRED / not a V2.04 MUST surface.
- Login/activation operate in a selected church context (aligned with Directory journey).

**Audit findings**

- Spec Completeness BLOCKING #2: decide Directory selection is authoritative tenant context; Church ID resolved inside that church.
- Distinct from uniqueness (P0-01) but coupled: Option C below only works cleanly with uniqueness Option B.

### 3. Options

**OPTION A**

| | |
|--|--|
| **BEHAVIOR** | Church Directory “Select Church” is authoritative session tenant for that login/activation; Church ID resolved only inside that church. Switching churches = re-enter via Directory (no in-app switcher in V2.04 claims). |
| **ADVANTAGES** | Matches published journey; works with uniqueness A; keeps FOUNDATION UX deferred. |
| **RISKS** | Multi-membership users must re-select church to change context. |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Positive: explicit tenant bind reduces wrong-membership activation. |
| **BACKWARD_COMPATIBILITY** | Compatible with current journey. |
| **IMPLEMENTATION_EFFORT** | LOW (document + assert session church from Directory). |
| **TEST_IMPACT** | AFTER_SPEC cases: multi-membership activation/login only under selected church. |

**OPTION B**

| | |
|--|--|
| **BEHAVIOR** | After credentials, if >1 membership, show membership picker; picker sets tenant. |
| **ADVANTAGES** | Explicit multi-membership UX. |
| **RISKS** | Elevates FOUNDATION UX into release MUST; more surface for errors. |
| **DATA_MODEL_IMPACT** | None structural; session rebind after pick. |
| **SECURITY/PRIVACY_IMPACT** | Safe if picker is membership-scoped to authenticated user only. |
| **BACKWARD_COMPATIBILITY** | Additive UX; changes login flow. |
| **IMPLEMENTATION_EFFORT** | MEDIUM–HIGH (UI + session rebind + packs). |
| **TEST_IMPACT** | New MUST journey automated + manual. |

**OPTION C**

| | |
|--|--|
| **BEHAVIOR** | Rely on org-unique Church ID + password; Directory optional for tenant bind. |
| **ADVANTAGES** | Credential-only login. |
| **RISKS** | Contradicts §4.2; requires uniqueness B; higher mix-up risk with historical data. |
| **DATA_MODEL_IMPACT** | Depends on uniqueness B migration. |
| **SECURITY/PRIVACY_IMPACT** | Higher cross-campus ambiguity if uniqueness not truly org-wide. |
| **BACKWARD_COMPATIBILITY** | Journey rewrite. |
| **IMPLEMENTATION_EFFORT** | HIGH (coupled to BB-01 B). |
| **TEST_IMPACT** | Rewrite login journey ACs. |

### 4–6. Recommendation

| | |
|--|--|
| **RECOMMENDED_OPTION** | **A** |
| **WHY** | Already implied by §4.2; lowest expansion of FOUNDATION into MUST; pairs with uniqueness A. |
| **CONFIDENCE** | **HIGH** |
| **Recommendation nature** | **Closes ambiguity** between MUST login and FOUNDATION multi-membership; does **not** require migration; **no** breaking schema; **BB only**. Spec appendix clarifying session bind (additive). |

---

## PD-V204-BB-03 — Recovery email fallback

### 1. Header

| Field | Value |
|-------|--------|
| **DECISION_ID** | PD-V204-BB-03 |
| **PRODUCT** | BB |
| **RELATED_REQUIREMENT** | FR-06 / AC-07 / DR-10 / P0-03 |
| **TITLE** | Password recovery email fallback criteria |
| **CURRENT_AMBIGUITY** | Spec requires phone OTP “with email fallback where available” without defining availability (verified only? any email? required if no phone?). |

### 2. Established facts

**Canonical spec**

- Forgot Password is mandatory.
- Flow: Church ID → locate membership → phone OTP, with email fallback where available → new password.
- Offline church admin path when member no longer controls recovery contact.
- Lost Church ID has no public automated recovery (separate from password recovery).

**Current implementation**

- Phone OTP recovery implemented; email fallback **not** implemented (FR-06 / DR-10 PARTIAL).
- Missing phone → neutral failure; no email recovery channel (`beginMemberPasswordRecovery` requires normalized phone per Spec Implementation audit).

**Audit findings**

- Completeness BLOCKING #3: choose (A) phone-only V2.04 or (B) verified-email OTP if phone absent; never unverified email.
- If Product chooses B, unlocks P1 email-channel implementation (T-A08); not a separate P0 engineering item until then.

### 3. Options

**OPTION A**

| | |
|--|--|
| **BEHAVIOR** | V2.04 phone OTP only; treat email phrase as future/FOUNDATION; offline admin covers no-phone cases. |
| **ADVANTAGES** | Matches current code; no new recovery attack surface; closes MUST without new channel. |
| **RISKS** | Phone-less members need church admin (already in spec for lost contact). |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Conservative; avoids unverified-email takeover class. |
| **BACKWARD_COMPATIBILITY** | Full. |
| **IMPLEMENTATION_EFFORT** | LOW (spec clarification / claim hygiene). |
| **TEST_IMPACT** | T-M05 phone-only; T-A08 not required for V2.04. |

**OPTION B**

| | |
|--|--|
| **BEHAVIOR** | If no usable phone, allow OTP to **verified** email only; never unverified. |
| **ADVANTAGES** | Self-service for phone-less members with verified email. |
| **RISKS** | Verified-flag integrity, enumeration, phishing, provider ops. |
| **DATA_MODEL_IMPACT** | Needs reliable verified-email signal on membership/user. |
| **SECURITY/PRIVACY_IMPACT** | Acceptable if verified-only + rate limits; still expands recovery surface. |
| **BACKWARD_COMPATIBILITY** | Additive channel. |
| **IMPLEMENTATION_EFFORT** | MEDIUM (email OTP path + config + tests). |
| **TEST_IMPACT** | T-A08 + T-M05 email branch required. |

**OPTION C**

| | |
|--|--|
| **BEHAVIOR** | Any email on file may receive recovery OTP. |
| **ADVANTAGES** | Maximum coverage. |
| **RISKS** | High account-takeover risk (completeness audit rejects this class). |
| **DATA_MODEL_IMPACT** | Minimal. |
| **SECURITY/PRIVACY_IMPACT** | **Unacceptable** for CRITICAL recovery. |
| **BACKWARD_COMPATIBILITY** | Additive but unsafe. |
| **IMPLEMENTATION_EFFORT** | MEDIUM (same plumbing as B, weaker rules). |
| **TEST_IMPACT** | Would need negative security cases; not recommended to certify. |

### 4–6. Recommendation

| | |
|--|--|
| **RECOMMENDED_OPTION** | **A** |
| **WHY** | Matches implementation; offline admin already covers contact loss; avoids shipping a new recovery channel under ambiguity. |
| **CONFIDENCE** | **HIGH** |
| **Recommendation nature** | **Closes ambiguity** by defining V2.04 MUST = phone-only; **changes canonical wording** (clarify email fallback as post-V2.04 / FOUNDATION) — not a silent contradiction if Product approves; **no migration**; **no breaking schema**; **BB only**. |

---

## PD-V204-BB-04 — Status transition matrices

### 1. Header

| Field | Value |
|-------|--------|
| **DECISION_ID** | PD-V204-BB-04 |
| **PRODUCT** | BB |
| **RELATED_REQUIREMENT** | Membership / portal statuses / checklist §17 / P0-04 |
| **TITLE** | Membership and portal status transition matrices |
| **CURRENT_AMBIGUITY** | Status **values** are defined; **who may transition what, when** (esp. INACTIVE/FORMER/BLOCKED ↔ ACTIVE) is missing. |

### 2. Established facts

**Canonical spec**

- Membership values (FOUNDATION): ACTIVE, INACTIVE, TRANSFERRED, FORMER, DECEASED.
- Portal values: NOT_ACTIVATED, ACTIVE, BLOCKED.
- Membership status and portal access status are separate.
- Authorized Pastor/Admin can block/unblock portal without deleting membership/history.
- Blocking preserves membership, attendance, requests, history.
- Prefer archive/status over ordinary hard delete.
- Checklist demands allowed transitions; no matrix published (Completeness: statuses Partial, transitions Missing).

**Current implementation**

- Enums FULL; block paths PARTIAL tested; transition WHO/WHEN underspecified vs Product contract.
- Gap plan: cannot FEATURE-certify full lifecycle without matrix.

**Audit findings**

- Completeness BLOCKING #4: publish membership + portal transition matrices with actor permissions.
- Register recommended a minimal matrix (Option A) rather than freezing accidental code behavior.

### 3. Options

**OPTION A**

| | |
|--|--|
| **BEHAVIOR** | Publish minimal V2.04 matrix: portal BLOCKED↔ACTIVE only via Pastor/Admin with block permission (session invalidate); membership ACTIVE↔INACTIVE via member-update permission; FORMER/TRANSFERRED/DECEASED admin-only and not member-self-reactivatable; NOT_ACTIVATED → portal ACTIVE only via successful activation. |
| **ADVANTAGES** | Testable authorization/lifecycle MUST; smallest complete close for release QA. |
| **RISKS** | Product may need later policy variance; some cells may need edit at approval time. |
| **DATA_MODEL_IMPACT** | None (enums unchanged). |
| **SECURITY/PRIVACY_IMPACT** | Directly defines who can restore access — critical for portal security. |
| **BACKWARD_COMPATIBILITY** | May tighten looser code paths once enforced. |
| **IMPLEMENTATION_EFFORT** | MEDIUM (align guards after approval; doc appendix). |
| **TEST_IMPACT** | Positive/negative transition cases AFTER_SPEC. |

**OPTION B**

| | |
|--|--|
| **BEHAVIOR** | Declare current production transition behavior normative; inventory as-is becomes the matrix. |
| **ADVANTAGES** | Fast document close. |
| **RISKS** | Codifies accidental behavior; harder to challenge later. |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Unknown until characterization — may under-document privilege gaps. |
| **BACKWARD_COMPATIBILITY** | Full for code; weak for intentional product control. |
| **IMPLEMENTATION_EFFORT** | LOW–MEDIUM (characterization + docs). |
| **TEST_IMPACT** | Characterization tests become the contract. |

**OPTION C**

| | |
|--|--|
| **BEHAVIOR** | Certify only block/unblock + activation paths for V2.04; other membership transitions marked FOUNDATION. |
| **ADVANTAGES** | Narrows claims; less Product drafting. |
| **RISKS** | Leaves membership lifecycle ACs incomplete for FEATURE QA. |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Portal block path covered; membership inactive/former rules remain soft. |
| **BACKWARD_COMPATIBILITY** | Full. |
| **IMPLEMENTATION_EFFORT** | LOW (scope notes). |
| **TEST_IMPACT** | Limited pack; many transitions OUT_OF_SCOPE. |

### 4–6. Recommendation

| | |
|--|--|
| **RECOMMENDED_OPTION** | **A** |
| **WHY** | Authorization and irreversible lifecycle need explicit actors; A unblocks QA without freezing unknown code accidents (B) or leaving large holes (C). |
| **CONFIDENCE** | **MEDIUM** (matrix cell contents are Product judgment; recommendation is the *shape*, Product may edit cells). |
| **Recommendation nature** | **Additive canonical appendix** (does not reopen status *values*); **closes ambiguity**; **no migration**; may **tighten** API/behavior if code was looser (not a schema break); **BB only**. |

---

## PD-V204-AC-01 — ActiveClinic V2.04 contract

### 1. Header

| Field | Value |
|-------|--------|
| **DECISION_ID** | PD-V204-AC-01 |
| **PRODUCT** | AC |
| **RELATED_REQUIREMENT** | AC V2.04 contract / P0-07 |
| **TITLE** | ActiveClinic V2.04 product contract scope |
| **CURRENT_AMBIGUITY** | No AC Canonical Feature Spec (FR/AC/BR) in-repo; unclear whether AC is release-gated product MUST or presentation/foundation only. |

### 2. Established facts

**Canonical / product sources**

- Inventory / Completeness: AC Canonical Spec **SPEC_NOT_FOUND** / BLOCKING.
- Existing AC Stitch decisions (PD-AC-01..10) cover wave blockers (P01 canonical titles, utilitarian admin UI, facility-scoped invite, clinical roles after schemas, offline presentational, messaging share, defer feature locks) — **not** a full FR/AC/BR contract.
- QA process forbids inventing ACs without Product contract.

**Current implementation**

- Website + editor foundation implemented; public/editor **SANITY_PASS**.
- Patient domain foundation implemented; patient **NOT_SANITY_TESTED** as product FEATURE pack.
- Gap plan: website presentation shipped; patient foundation in implemented scope but without AC FR pack.

**Audit findings**

- Completeness: author AC Canonical Spec **or** declare Stitch/website presentation-only with no new clinical/domain MUST claims.
- Burndown P0-07: waiver unlocks whether P1 Stitch matrix / PHI / patient packs are release-gated.

### 3. Options

**OPTION A**

| | |
|--|--|
| **BEHAVIOR** | Author AC Canonical Feature Spec (actors, FR/AC/BR, decision classes) and use it to gate AC release claims. |
| **ADVANTAGES** | Objective gating; proper PHI/Stitch/patient ACs. |
| **RISKS** | Schedule; may delay V2.04 if AC remains in the gate. |
| **DATA_MODEL_IMPACT** | None by itself; may drive later schema MUST. |
| **SECURITY/PRIVACY_IMPACT** | Enables explicit PHI/authz rules. |
| **BACKWARD_COMPATIBILITY** | N/A (contract creation). |
| **IMPLEMENTATION_EFFORT** | HIGH (spec program + mapping + FEATURE QA). |
| **TEST_IMPACT** | Full AC FEATURE packs become required. |

**OPTION B**

| | |
|--|--|
| **BEHAVIOR** | For V2.04: public website/editor are presentation-only; patient foundation explicitly **non-release-gated**; no AC product MUST claims beyond existing SANITY_PASS presentation smoke. |
| **ADVANTAGES** | Honest scope; unblocks BB-focused V2.04 closeout; avoids inventing ACs. |
| **RISKS** | Marketing must not overclaim AC completeness; patient remains FOUNDATION. |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Defers formal public PHI policy as non-gating P1 until spec exists — must still avoid known unsafe fields in presentation. |
| **BACKWARD_COMPATIBILITY** | Full for code; changes **release claims** only. |
| **IMPLEMENTATION_EFFORT** | LOW (waiver / release-notes / gate docs). |
| **TEST_IMPACT** | AC patient FEATURE packs non-gated for V2.04; website sanity remains smoke. |

**OPTION C**

| | |
|--|--|
| **BEHAVIOR** | Gate website presentation only; still require a minimal patient AC list before any patient UI claims. |
| **ADVANTAGES** | Middle path for patient honesty. |
| **RISKS** | Partial contract still blocks patient FEATURE QA; ambiguous “claims” boundary. |
| **DATA_MODEL_IMPACT** | None. |
| **SECURITY/PRIVACY_IMPACT** | Patient ACs would force authz/privacy criteria sooner. |
| **BACKWARD_COMPATIBILITY** | Full for code. |
| **IMPLEMENTATION_EFFORT** | MEDIUM (short patient AC list + limited pack). |
| **TEST_IMPACT** | Patient pack AFTER_SPEC; website smoke unchanged. |

### 4–6. Recommendation

| | |
|--|--|
| **RECOMMENDED_OPTION** | **B** |
| **WHY** | Matches evidence (SANITY_PASS website, patient FOUNDATION, SPEC_NOT_FOUND); closes release gate without inventing ACs; Option A remains required before AC is sold as a completed module. |
| **CONFIDENCE** | **MEDIUM** (Product/commercial choice, not a technical necessity). |
| **Recommendation nature** | **Scope waiver** (not a BB canonical rewrite); **closes release-gating ambiguity**; **no migration**; **no breaking API/schema**; **AC only**. Option A still required later for full AC product certification. |

---

## Preserved non-critical (not for this review)

| ID | STATUS | NOTE |
|----|--------|------|
| PD-V204-BB-05 | TEMPORARY_APPROVED_FOR_V2_04 | Cells DEFER for V2.04; `MUST IF CELLS` inactive; do not reopen in this critical review. |

---

## Proposed Temporary Product Decisions for V2.04

Suitable for approval as one-sentence Product decisions:

1. **PD-V204-BB-01:** For V2.04, Church ID is unique per church (`church_id`), not per organization; update FR-02/BR-01 wording accordingly.  
2. **PD-V204-BB-02:** For V2.04, Church Directory “Select Church” authoritatively binds session tenant for login/activation; multi-membership switcher UX remains deferred.  
3. **PD-V204-BB-03:** For V2.04, password recovery MUST is phone OTP only; email fallback is out of V2.04 MUST scope (FOUNDATION / later), with offline church admin for contact loss.  
4. **PD-V204-BB-04:** For V2.04, adopt the minimal membership/portal actor transition matrix in Option A (Product may edit individual cells before freeze).  
5. **PD-V204-AC-01:** For V2.04, ActiveClinic website/editor is presentation-only and patient foundation is non-release-gated; no AC Canonical Feature Spec gate until Product authors one for a later claim.

---

```
CRITICAL_DECISIONS=5
RECOMMENDATIONS_HIGH_CONFIDENCE=3
RECOMMENDATIONS_MEDIUM_CONFIDENCE=2
RECOMMENDATIONS_LOW_CONFIDENCE=0
MIGRATIONS_REQUIRED=0
PLATFORM_LEVEL_DECISIONS=0
BB_ONLY_DECISIONS=4
AC_ONLY_DECISIONS=1
FINAL=V2_04_CRITICAL_DECISION_REVIEW_READY
```
