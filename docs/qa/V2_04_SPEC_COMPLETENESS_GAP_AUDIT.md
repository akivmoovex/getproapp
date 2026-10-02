# V2.04 Specification Completeness Gap Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_SPEC_COMPLETENESS_GAP_AUDIT` |
| **VERSION** | **2.04** |
| **Mode** | **READ-ONLY PRODUCT SPEC AUDIT** |
| **Primary BB contract** | `BlessBoard_V2.04_Canonical_Feature_Specification_FINAL.pdf` (FR / AC / BR / Decision Register) |
| **Secondary BB** | `BlessBoard_V2.04_Member_Feature_Decision_Specification_QA.pdf` |
| **AC contract** | **SPEC_NOT_FOUND** (Stitch implementation map/prompts are visual/engineering, not a product FR/AC/BR contract) |
| **Implementation note** | Code consulted **only** where it exposes a product question the spec leaves open (not to score implementation) |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_SPEC_COMPLETENESS_AUDIT_COMPLETE`** |

---

## 0. Scope

This audit asks whether Product/QA can execute V2.04 **without inventing decisions**. It does **not** rewrite the specification and does **not** classify code as FULL/PARTIAL.

Severity is used only where ambiguity affects: identity, permissions, privacy, tenant isolation, data integrity, workflow state, security, or auditability.

---

## 1. Completeness checklist summary (BlessBoard Canonical Spec)

| # | Question | Verdict | Comment |
|---|----------|---------|---------|
| 1 | Actors defined? | **Mostly** | Ordinary Member, Pastor, Secretary, Church Admin, Cell Leader, Ministry/Dept Leader, Platform Admin, Visitor listed; **how dual-role identity is bound** (one login vs two) not defined |
| 2 | Identity vs permission boundaries explicit? | **Mostly** | Person ≠ membership ≠ portal asserted; **permission key catalogue incomplete/inconsistent** (see gaps) |
| 3 | Fields: required/optional/format/validation/uniqueness/ownership/editability? | **Partial** | Profile allowlist + minimum create fields given; **formats/lengths/phone rules deferred to “platform”**; gender/baptism appear in Stitch UI without product field rules in this contract |
| 4 | Identifiers + uniqueness scopes? | **Ambiguous** | Church ID unique “within church organization” **vs** BR-01 “within organization” |
| 5 | Statuses defined? | **Partial** | Membership, portal, request statuses listed; attendance session lifecycle **not** in this contract |
| 6 | Allowed state transitions? | **Missing** | Spec checklist demands transitions; **no transition matrix** for membership, portal, requests, attendance |
| 7 | Failure paths defined? | **Partial** | Strong on activation mismatch, duplicates, self-approve; weak on recovery with **no** verified contacts |
| 8 | Recovery flows defined? | **Partial** | Lost ID / offline admin path; phone OTP; **“email fallback where available” undefined** |
| 9 | Duplicate rules defined? | **Mostly** | Hard-block Church ID; warn phone/email/name+DOB; no auto-merge; merge DEFERRED |
| 10 | Authorization + resource scopes? | **Partial** | Permissions named conceptually; **leader→resource binding model undefined**; `MUST IF CELLS` undefined |
| 11 | Tenant boundaries explicit? | **Partial** | Tenant-scoped membership stated; **org vs church vs branch** uniqueness/isolation not fully disambiguated |
| 12 | Audit events + required metadata? | **Partial** | Event types listed; **required metadata (reason, before/after, actor)** incomplete |
| 13 | Notification behaviors? | **Weak** | RECOMMENDED in-app first; **no event catalogue** for MUST workflows |
| 14 | Session/security consequences? | **Partial** | Invalidate “relevant” sessions — **which sessions** for dual-role users undefined; rate limits required **without thresholds** |
| 15 | Deletion/retention/history? | **Partial** | Prefer inactive/archive; exceptional delete “tightly restrict” **without who/when** |
| 16 | Concurrency/idempotency? | **Partial** | QR duplicate idempotent; **activation/create/request double-submit** not specified |
| 17 | ACs executable without Product? | **Mostly for core auth; weak for scope/dual-role** | AC-12/13/16 need product definitions to be objective |
| 18 | MUST depends on undefined FOUNDATION? | **Yes (limited)** | Multi-membership FOUNDATION vs login church selection; request engine FOUNDATION OK if statuses fixed |
| 19 | Contradictory requirements? | **Yes (material)** | Church ID uniqueness scope org vs church |
| 20 | Implementation-sensitive open decisions? | **Yes** | Permission key names, leader resource binding, QR TTL, email fallback criteria, dual-role UX |

**ActiveClinic:** Questions 1–20 largely **unanswered** because no V2.04 product feature specification exists (see §3).

---

## 2. BlessBoard specification gaps

| SPEC | SECTION/ID | QUESTION_NOT_ANSWERED | WHY_IT_MATTERS | RISK | SUGGESTED_PRODUCT_DECISION | SEVERITY |
|------|------------|----------------------|----------------|------|----------------------------|----------|
| BB Canonical | FR-02, BR-01, Decision #1 | Is Church ID unique per **church** or per **organization** (multi-church org)? | Uniqueness, import, activation lookup, and tenant isolation differ | Wrong uniqueness → duplicate IDs across campuses **or** false collisions | **Decide:** unique per `church_id` (campus) **or** per `organization_id`; update FR-02/BR-01 to one wording | **BLOCKING** / identity |
| BB Canonical | §4.2 / login journey | After “Select Church”, how is church context bound for activation/login when a person has **multiple memberships** (FOUNDATION #28)? | MUST login uses Church ID; FOUNDATION allows multi-membership without selection rules | Wrong membership activated; cross-tenant identity mix-up | **Decide:** Church Directory selection is authoritative tenant context for that session; Church ID unique only inside that church | **BLOCKING** / identity+tenant |
| BB Canonical | Decision #10 / FR-06 | What does email fallback “**where available**” mean? Verified email only? Any email on file? Required if phone missing? | Security of account recovery | Account takeover **or** members locked out with no phone | **Decide:** (A) phone-only for V2.04; or (B) verified email OTP if phone absent; never unverified email | **BLOCKING** / security |
| BB Canonical | §5 statuses / checklist §17 | What are **allowed transitions** for membership status and portal status (who may set each; can INACTIVE/FORMER activate; can BLOCKED → ACTIVE without re-verify)? | Workflow state + access control | Unauthorized portal access or stuck members | Publish transition matrices for membership + portal with actor permissions | **BLOCKING** / workflow+security |
| BB Canonical | §9 RBAC / Decision #25,#39 | How is a ministry/department/cell **leader bound** to managed resource IDs? Exact permission keys? | MUST scoped review/attendance cannot be tested or implemented consistently | Over-broad access **or** fail-closed leaders cannot operate | Define assignment entity + permission keys (`requests.review` vs aliases); require resource binding before leader review | **BLOCKING** / permissions |
| BB Canonical | Decision #46 `MUST IF CELLS` | Are **cells** in V2.04 scope? If yes, what is a cell, membership, and attendance scope? | Conditional MUST is not testable | QA cannot pass/fail cell-leader scenarios | **Decide:** cells **out of V2.04** (reclassify #46 DEFER) **or** supply cell domain mini-spec | **BLOCKING** / permissions |
| BB Canonical | FR-12 / Decision #27 / Edge “Leader is also a member” | How does dual-role access work: same credentials? Linked staff user ↔ member? Required nav destinations? | Identity + permission boundary | Staff session ≠ member session confusion; privacy leaks | **Decide:** dual-role requires linked `userId` + explicit “Open Member Portal” / “Open Management” destinations | **HIGH** / identity+permissions |
| BB Canonical | §12 / Decision #51 | Which sessions are “**relevant**” on block/password reset for a dual-role user (member only vs all product sessions)? | Session security | Admin session left alive after member block/reset | **Decide:** invalidate all sessions for that auth identity on block/reset; or list session classes | **HIGH** / security |
| BB Canonical | §12 / Decision #52 | What are rate-limit **thresholds**, windows, and lockout behavior? | Security + AC executability | Ineffective protection or flaky QA | Specify per-endpoint limits (e.g. N/15min/IP+ChurchID) and UX | **HIGH** / security |
| BB Canonical | §12 Audit / Decision #44 | Which audit events **require** reason, before/after values, actor, org/church/branch? | Auditability of privileged actions | Incomplete forensic trail | Mandate metadata table for create, Church ID change, block, transfer, attendance correct, request decide | **HIGH** / auditability |
| BB Canonical | FR-10 / Decision #22 | Is **reason required** to block/unblock? Max length? Visible to member? | Admin accountability + privacy | Unaudited blocks | Require non-empty reason; store in audit; decide member-visible copy | **MEDIUM** / auditability |
| BB Canonical | Request §11 | Who may **CANCEL** a request (requester, admin, both)? After approve? | Workflow state | Illegal cancels or stuck PENDING | Requester may cancel only while PENDING; admin may cancel/reject with reason | **MEDIUM** / workflow |
| BB Canonical | Attendance §10 / FR-14 | What is QR **TTL** default/max? Clock skew? Timezone of event? | Duplicate/expiry security | Replay or false expiry | Default TTL (e.g. 15 min), max 24h; server time authoritative | **MEDIUM** / security+workflow |
| BB Canonical | Attendance | Session lifecycle (draft/open/closed/locked) and who may transition — **absent** from member feature contract though V2.04 ships sessions | Workflow state for FR-13/14 | Product/QA invent attendance ops rules | Either add attendance session mini-spec to V2.04 contract or declare session states FOUNDATION with MUST transition table | **MEDIUM** / workflow |
| BB Canonical | Attendance edge | Member scans QR for **wrong branch/session** — allowed with metadata, reject, or warn? Only cell-leader unrelated case specified | Data integrity of attendance | Contaminated attendance rolls | **Decide:** reject cross-branch **or** accept with `wrong_branch` flag (and who sees it) | **MEDIUM** / data integrity |
| BB Canonical | Decision #19 | “Preferred/current worship location may be separate” from official branch — is it a field in V2.04? Editable by member? | Profile ownership | Official branch edited via side door | Defer field **or** define as member-editable preference with no authz impact | **MEDIUM** / data model |
| BB Canonical | §6 / AC-02 minimum | Is **DOB** required for duplicate name+DOB warnings if optional on create? | Duplicate integrity | Warnings never fire or create blocked incorrectly | DOB optional; name+DOB warn only when DOB present on both records | **MEDIUM** / data integrity |
| BB Canonical | §3 / create | Full name matching vs first/last/preferred — which fields compose activation “Full Name”? | Identity match | False rejects/accepts | Define canonical match string = normalized first+last (preferred excluded) | **MEDIUM** / identity |
| BB Canonical | Decision #2 | Allowed Church ID character set, max length, leading zeros, Unicode? | Identifier validation | Inconsistent import/login | Alphanumeric + `-` `/` space; max length N; trim; case-insensitive compare | **MEDIUM** / identity |
| BB Canonical | Decision #7 / exceptional delete | Who may perform exceptional hard delete; retention; tombstones? | History + privacy | Silent destruction of history | V2.04: **no hard delete** in product UI; Platform Admin only with ticketed audit if ever | **MEDIUM** / data integrity |
| BB Canonical | Decision #43 / workflows | Which MUST events emit in-app notifications (join decision, block, transfer)? | Member/admin awareness | Silent state changes | Minimum: request decision + portal blocked notify in-app; else explicit “none in V2.04” | **MEDIUM** / workflow |
| BB Canonical | Concurrency | Idempotency for **member create** double-submit, activation replay, request double-join? | Data integrity | Duplicate members/requests | Require idempotency keys / unique pending constraints (product states intent) | **MEDIUM** / data integrity |
| BB Canonical | Platform Admin § / Decision #55 | Which Platform Admin actions may create/edit/block members across tenants? | Tenant isolation | Cross-tenant privilege ambiguity | Enumerate allowed Platform Admin membership interventions + mandatory audit | **HIGH** / tenant+permissions |
| BB Canonical | FR-18 / forms | “Ordinary member document uploads disabled” vs member **forms/requests** that may have attachments elsewhere — in or out of this journey? | Privacy / upload boundary | Spec vs adjacent features conflict | Clarify: V2.04 member journey forbids **new** uploads; existing forms attachments governed by forms spec | **MEDIUM** / privacy |
| BB Canonical | AC-12, AC-13, AC-16 | ACs reference multi-admin coexistence, dual experience, and “authorization scope” without measurable definitions | QA cannot objectively pass/fail | False PASS/FAIL gates | Rewrite ACs with concrete preconditions (two admin users; dual-role fixture; scoped leader fixture) | **HIGH** / (testability of permissions) |
| BB Canonical | Decision #25 vs examples | Spec forbids title-hardcoding yet names Pastor/Secretary as actors who “may be granted” permissions — are default role bundles normative? | Permissions | Implicit title authz | Publish entitlement matrix: role → permission keys (normative for V2.04) | **MEDIUM** / permissions |
| BB Decision Spec vs Canonical | Permission naming | Decision text uses `members.church_id.manage`; engineering catalogue may differ — **spec does not freeze key strings** | Implementation drift | Authz mismatches across docs/tests | Freeze normative permission key list in the Canonical Spec | **MEDIUM** / permissions |
| BB Canonical | Notifications vs MUST | MUST join/attendance/block flows have **no** MUST notification ACs (only RECOMMENDED #43) | Incomplete acceptance for multi-admin ops | Operators unaware of pending requests | Either elevate minimum notify ACs or state “notifications non-blocking for V2.04” | **LOW** / workflow |
| BB Canonical | Peak / late / wrong-branch | Not in Canonical Member Spec but appear in Stitch/screens | Contract vs design pack split | Spec completeness for attendance ops | Add to attendance section or mark Stitch-only non-contract | **LOW** / workflow |

---

## 3. ActiveClinic specification gaps

| SPEC | SECTION/ID | QUESTION_NOT_ANSWERED | WHY_IT_MATTERS | RISK | SUGGESTED_PRODUCT_DECISION | SEVERITY |
|------|------------|----------------------|----------------|------|----------------------------|----------|
| AC V2.04 | *(missing)* | Where is the **Canonical ActiveClinic V2.04 Feature Specification** (actors, FR/AC/BR, decision classes)? | No product/QA contract for AC V2.04 beyond Stitch visuals | Cannot objectively test AC product intent; inventing ACs is forbidden | Author AC V2.04 Canonical Feature Spec mirroring BB structure | **BLOCKING** |
| AC Stitch map | R01–R12 / E01–E02 / H01–H06 | Which Stitch controls are **MUST product behavior** vs chrome vs FUTURE_CAPABILITY? | H03/H06 already marked future in engineering docs without product register | False release blockers for visual-only controls | Product-signed matrix: MUST / PRESENTATION / FUTURE per control | **HIGH** |
| AC Stitch / booking | R08 booking entry | Is Stitch booking entry allowed to change **booking domain rules**, or chrome-only forever? | Clinical/workflow integrity | Accidental second booking engine | Affirm: chrome/handoff only; booking engine unchanged (write as AC MUST) | **HIGH** / workflow |
| AC Patient foundation docs | Staff Add Patient | Portal vs patient, Patient Number, duplicates partially documented — **no AC-01..n acceptance pack** | QA cannot certify patient foundation as release criteria | Unscoped “done” claims | Publish AC patient V2.04 AC list or mark foundation non-release-gated | **MEDIUM** |
| AC V2.04 | Tenant/facility | Facility websites still “not supported” historically — is that still a V2.04 product rule? | Tenant/product boundary | Scope creep into unsupported facility sites | Reaffirm NOT SUPPORTED in AC V2.04 product notes | **MEDIUM** / tenant |
| AC V2.04 | Security/privacy | No AC register for authz on hub/editor/public vs PHI on public pages | Privacy | PHI leak via public website content rules undefined | Define public-safe field policy for doctor/services pages | **HIGH** / privacy |

---

## 4. Counts by theme

### BlessBoard gaps (rows in §2)

Material BB rows = **29** (including low-severity contract hygiene).

### ActiveClinic gaps (rows in §3)

AC rows = **6** (dominated by missing canonical spec).

### Footer categories (subset tagging; a gap may count in one primary bucket)

| Bucket | Count | Primary examples |
|--------|------:|------------------|
| **BLOCKING_PRODUCT_DECISIONS** | **7** | Church ID uniqueness scope; multi-membership login context; email fallback criteria; status transition matrices; leader↔resource binding; cells in/out; missing AC canonical spec |
| **SECURITY_AMBIGUITIES** | **6** | Email fallback; relevant sessions; rate limits; Platform Admin cross-tenant; QR TTL; public PHI policy (AC) |
| **WORKFLOW_AMBIGUITIES** | **8** | Status transitions; request cancel; attendance session lifecycle; wrong-branch QR; dual-role destinations; booking chrome (AC); notifications; Stitch MUST vs FUTURE |
| **DATA_MODEL_AMBIGUITIES** | **7** | Org vs church uniqueness; preferred worship field; DOB optional vs dup rules; name match composition; Church ID charset; exceptional delete; cell domain |

---

## 5. Guidance (non-rewrite)

1. Resolve the **seven BLOCKING** decisions before treating V2.04 member/AC packs as fully QA-closed.
2. Add **transition matrices** and a **frozen permission key list** to the BB Canonical Spec (small additive appendix — not a full rewrite).
3. Produce an **AC Canonical Feature Spec** or explicitly declare AC V2.04 Stitch work as **presentation-only** with no new clinical/domain MUST claims.
4. Do not treat Decision **DEFER/RECOMMENDED** items as spec defects; do treat **MUST that depend on undefined bindings** (leaders, cells, email fallback) as product blockers.

---

BB_SPEC_GAPS=29
AC_SPEC_GAPS=6
BLOCKING_PRODUCT_DECISIONS=7
SECURITY_AMBIGUITIES=6
WORKFLOW_AMBIGUITIES=8
DATA_MODEL_AMBIGUITIES=7
FINAL=V2_04_SPEC_COMPLETENESS_AUDIT_COMPLETE
