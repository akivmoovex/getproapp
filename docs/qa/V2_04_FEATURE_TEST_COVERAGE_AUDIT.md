# V2.04 Feature Test Coverage Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_FEATURE_TEST_COVERAGE_AUDIT` |
| **VERSION** | **2.04** |
| **BRANCH** | `V4` |
| **Mode** | **READ-ONLY** (no code/test changes; suite not re-run) |
| **Inventory source** | `docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md` |
| **BB contract** | Canonical Member Feature Spec — **AC-01..AC-25** (+ security/BR extras) |
| **AC contract** | **`SPEC_NOT_FOUND` / `SPEC_GAP`** — no AC-style acceptance criteria; feature-level mapping to inventory IDs only |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_FEATURE_TEST_COVERAGE_AUDIT_COMPLETE`** |

---

## 0. Method

1. Took NEW/CHANGED/FOUNDATION inventory rows as the feature set.
2. For BlessBoard, mapped **every AC-01..AC-25** to executable tests and **checked assertions** (not filename presence).
3. Added security/business-rule rows that are not fully represented by a single AC (special-attention list).
4. For ActiveClinic, **did not invent** acceptance criteria → **SPEC_GAP** at criteria grain; scored inventory FEATURE_IDs only.
5. Classification meanings:

| Status | Meaning |
|--------|---------|
| **COVERED** | Positive + key negative (and RBAC/isolation where applicable) asserted behaviorally |
| **PARTIAL** | Material path(s) asserted; important dimension(s) missing |
| **TEST_EXISTS_BUT_WEAK** | Tests exist but are mostly wiring/source/string checks without behavioral proof |
| **UNTESTED** | Requirement in scope; no meaningful automated assertion found |
| **NOT_IMPLEMENTED** | Feature not present (none found for in-scope MUST ACs) |
| **DEFERRED** | Explicitly out of V2.04 scope (counted separately; not in BB/AC requirement totals below) |
| **SPEC_GAP** | No canonical requirement ID to map (ActiveClinic criteria) |

**POS / NEG / RBAC / EDGE** columns: `Y` = present with real assertion · `P` = partial/weak · `N` = missing · `-` = not applicable.

This audit does **not** manufacture a line-coverage % from requirement mapping.

---

## 1. Existing c8 / coverage artifacts (cited only; not re-run)

| Artifact | Present? | Cited value |
|----------|----------|-------------|
| Dedicated V2.04 / v204 coverage summary | **No** | — |
| `coverage/v203/coverage-summary.json` | Yes (V2.03-era) | lines **67.27%** · statements **67.27%** · branches **63.47%** · functions **66.66%** |
| Other `coverage/v203-*` trees | Yes | Historical V2.03 waves; not V2.04 member/Stitch evidence |

Do **not** treat 67.27% as V2.04 member-feature coverage.

---

## 2. BlessBoard — AC-01..AC-25 (canonical)

Implementation hubs (shared across rows):  
`src/blessboard/services/blessBoardMemberDomainService.js`, `blessBoardMemberPortalAuthService.js`, member portal/admin/attendance/join services + `views/blessboard/v5/**`.

| REQ | FEATURE | IMPLEMENTATION | TESTS | POS | NEG | RBAC | EDGE | STATUS | GAP |
|-----|---------|----------------|-------|-----|-----|------|------|--------|-----|
| AC-01 | Member cannot self-create membership | `assertStaffActor` / `SELF_CREATE_FORBIDDEN`; visitor auto-forbid | `v2-04-bb-member-domain.test.js` (`forbids self-create and visitor auto membership`) | Y | Y | Y | Y | **COVERED** | — |
| AC-02 | Authorized create with Church ID + minimum data | `createStaffManagedMember`; M01–M05 flow | `member-domain`, `member-creation-flow`, `m01-m02-members` | Y | Y | Y | Y | **COVERED** | — |
| AC-03 | Activation without email | Auth verify/complete; `emailDisplay: null`, `email: null` happy path | `v2-04-bb-member-auth.test.js` (activation completes with null email) | Y | N | - | P | **COVERED** | No dedicated “email supplied mismatch” matrix; optional path exercised |
| AC-04 | Invalid activation creates nothing | `verifyFirstTimeMembership` unknown ID; create not invoked | `member-auth` (`does not create membership when verification fails…`) | Y | Y | - | Y | **COVERED** | Spy is local; create path not instrumented on repo (still asserts failure + no create call flag) |
| AC-05 | Password policy rejects weak passwords | `validateMemberPortalPassword` | `member-auth` password policy + weak on `completeFirstTimeActivation` | Y | Y | - | Y | **COVERED** | — |
| AC-06 | Returning login Church ID + password | `authenticateMemberByChurchId` | `member-auth` returning login | Y | Y | - | Y | **COVERED** | Case-variant Church ID login not asserted (see BB-CHURCH-ID-CASE-NORM) |
| AC-07 | Forgot Password via verified contact | Recovery begin + OTP complete | `member-auth` recovery suite | Y | Y | - | P | **PARTIAL** | Phone OTP + revoke covered; **email fallback** path not asserted; “verified contact” OTP issue/send mocked |
| AC-08 | Lost Church ID — no public automated recovery | `lostChurchIdGuidance()` | `member-auth` (`automatedRecovery === false`) | Y | Y | - | Y | **COVERED** | Guidance/unit; no HTTP route negative for inventing recovery endpoint |
| AC-09 | Member edits permitted fields; cannot edit Church ID | Domain + portal profile | `member-domain`, `member-portal` | Y | Y | Y | Y | **COVERED** | — |
| AC-10 | Member cannot directly change official branch | `BRANCH_NOT_MEMBER_EDITABLE` | `member-domain`, `member-portal` | Y | Y | Y | Y | **COVERED** | — |
| AC-11 | New recovery phone must be verified | Pending phone fields; `startMemberPhoneVerification` | `member-domain`, `member-portal` | Y | P | - | P | **PARTIAL** | Pending flag covered; **`completeMemberPhoneVerification` OTP success/fail not behaviorally tested** (only `start…` route string) |
| AC-12 | Multiple admins + permissions enforced | RBAC `members.*` catalogue | domain/admin-profile/request suites | P | Y | Y | N | **PARTIAL** | Permission deny covered; **no two-admin coexistence / concurrent admin** scenario |
| AC-13 | Dual-role Member Portal + Church Management | Member shell + branch-admin destinations | Template markers only (`dashboard.ejs` M20, admin templates) | N | N | N | N | **UNTESTED** | No test that one user with Church ID + admin perms can access **both** experiences |
| AC-14 | Block/unblock without destroying history | `setPortalAccessStatus`; membership unchanged | `member-domain`, `member-admin-profile` | Y | Y | Y | Y | **COVERED** | — |
| AC-15 | Blocked member cannot continue relevant session | Session revoke on block; recovery revoke; `requireActiveMemberForTenant` | `member-admin-profile`, `member-auth` | Y | Y | Y | Y | **COVERED** | — |
| AC-16 | Manual attendance respects authorization scope | Shared check-in engine + session ops | `attendance-checkin`, `attendance-domain`, `attendance-session-ops` | Y | Y | Y | Y | **COVERED** | Cell-leader narrow scope not distinct from permission deny |
| AC-17 | Time-limited event QR records attendance | `issueSessionCheckInQr` / `checkInQr`; `EXPIRED_QR` | `attendance-checkin`, `attendance-domain` | Y | Y | Y | Y | **COVERED** | — |
| AC-18 | Duplicate attendance prevented | Duplicate returns existing; no second insert | check-in + domain suites | Y | Y | Y | Y | **COVERED** | — |
| AC-19 | Attendance correction auditable | Correction requires reason; preserves original; audit views | `attendance-correction`, domain correction cases | Y | Y | Y | Y | **COVERED** | — |
| AC-20 | Join creates pending request (not enroll) | Join adapter PENDING | `request-admin`, `request-approval`, portal join | Y | Y | - | Y | **COVERED** | — |
| AC-21 | Scoped reviewer approve/reject | `assertResourceScopedReview` | `request-admin`, `request-approval` | Y | Y | Y | Y | **COVERED** | — |
| AC-22 | Requester cannot self-approve | `SELF_APPROVAL_DENIED` | `request-admin`, `request-approval` | Y | Y | Y | Y | **COVERED** | — |
| AC-23 | Member cannot view other members’ private/admin data | Portal scope `memberId: scope.memberId` | `member-portal` (route/source match) | N | N | P | N | **TEST_EXISTS_BUT_WEAK** | **No cross-member profile access denial assertion** |
| AC-24 | Ordinary member cannot upload documents | Restriction (absence) | — | N | N | N | N | **UNTESTED** | No automated assert that member portal lacks upload / rejects upload |
| AC-25 | History uses immutable `member_id` after Church ID/name/phone change | Schema `REFERENCES blessboard.members(id)`; domain uses `memberId` | Migration file exists; check-ins use `memberId` | P | N | - | N | **PARTIAL** | FK present in SQL; **no behavioral test** that after `manageChurchId` attendance/requests still resolve |

### 2.1 BlessBoard extras (special-attention / BR / security not a single AC)

| REQ | FEATURE | IMPLEMENTATION | TESTS | POS | NEG | RBAC | EDGE | STATUS | GAP |
|-----|---------|----------------|-------|-----|-----|------|------|--------|-----|
| BB-CHURCH-ID-CASE-NORM | Church ID case-insensitive normalize on login/activate | `lower(trim(member_number))` in repo + unique index | Migration/domain string checks only | N | N | - | N | **UNTESTED** | No `ch-10001` vs `CH-10001` auth assertion |
| BB-NO-AUTOMERGE | Likely duplicates warn; never auto-merge | Creation flow + duplicate engine | `member-creation-flow` (phone/name+DOB; open_existing; never auto-merges) | Y | Y | Y | Y | **COVERED** | — |
| BB-STATUS-SPLIT | Membership status ≠ portal access | Domain constants + block path | `member-domain`, admin-profile labels | Y | Y | Y | Y | **COVERED** | — |
| BB-SEC-RATE | Rate-limit activation/login/recovery | Auth rate bucket | `member-auth` rate-limit activation | Y | Y | - | Y | **COVERED** | Login/recovery rate limits not separately asserted |
| BB-ENUM-SAFE | Public errors must not enumerate IDs | Neutral verify/recovery messages | `member-auth` activation + recovery | Y | Y | - | Y | **COVERED** | — |
| BB-QR-OPAQUE | QR excludes Church ID/phone/member PII | Token payload | `attendance-checkin`, `attendance-domain` | Y | Y | - | Y | **COVERED** | — |
| BB-ADMIN-SEARCH | Admin search by Church ID/name/phone in scope (FR-20) | `memberIdentityRepository` list/q | `m01-m02` source plumbing match | N | N | N | N | **TEST_EXISTS_BUT_WEAK** | No behavioral search query assertions / scope deny |
| BB-WEBSITE-ENGINE | BB cutover to platform website engines | Adapters + lifecycle hooks | `bb-website-platform-adapter`, `bb-lifecycle-cutover`, `bb-clean-db-e2e`, presentation cutover | Y | Y | P | Y | **COVERED** | Authz mostly via shared website suites |

---

## 3. ActiveClinic — criteria `SPEC_GAP`; inventory feature-level only

**SPEC_GAP:** No ActiveClinic V2.04 Canonical Feature Specification with AC/FR/BR IDs.  
Do **not** invent acceptance criteria. Rows below are inventory FEATURE_IDs only.

| REQ | FEATURE | IMPLEMENTATION | TESTS | POS | NEG | RBAC | EDGE | STATUS | GAP |
|-----|---------|----------------|-------|-----|-----|------|------|--------|-----|
| AC-MW-PUBLIC | Stitch public R01–R12 | AC public views + presentation | `v2-04-ac-stitch-batch-2..4-*.test.js` | Y | Y | - | Y | **COVERED** | Criteria SPEC_GAP; tests are presentation/wiring/parity |
| AC-MW-EDITOR | Stitch E01–E02 on WE01 | Shared editor chrome | `v2-04-ac-stitch-batch-5-inline-editor.test.js` | Y | Y | P | Y | **COVERED** | Visual polish deferred; criteria SPEC_GAP |
| AC-MW-HUB | Hub H01–H06 | `/app/settings/website*` | `v2-04-ac-stitch-batch-6-website-hub.test.js`, batch-7 | Y | P | Y | Y | **PARTIAL** | H03/H06 FUTURE_CAPABILITY informational; criteria SPEC_GAP |
| AC-WEBSITE-ADAPTER | AC presentation adapter | Adapter module(s) | `v2-04-ac-website-presentation-adapter.test.js` | Y | Y | - | Y | **COVERED** | Criteria SPEC_GAP |
| AC-PATIENT-DOMAIN | Staff Add Patient foundation | `activeClinicPatientDomainService.js` | `v2-04-ac-patient-domain.test.js` | Y | Y | Y | Y | **COVERED** | UI Stitch deferred by design; criteria SPEC_GAP |
| _(meta)_ | AC V2.04 acceptance-criteria register | — | — | - | - | - | - | **SPEC_GAP** | Cannot map AC-style IDs |

Deferred AC polish from freeze (not in AC_REQUIREMENTS total): E01/E02 POST_QA_POLISH, H03/H06 FUTURE_CAPABILITY, medium Stitch gaps → **DEFERRED** (see inventory §7).

---

## 4. Shared platform (inventory) — brief coverage note

Not included in BB_/AC_ footer totals. Observed: geography QA-01..03, color/theme, website presentation/components/media, person/duplicate/staff-workflow/approval, mini-website concurrency, and release-hardening suites exist under `tests/v2-04-*.js` with behavioral assertions for the main NEW shared engines. Full shared requirement-by-requirement matrix is out of scope of the BB AC-25 mandate but those suites are real (not filename-only).

---

## 5. Critical / high test gaps (actionable)

### CRITICAL_TEST_GAPS (security / privacy / identity integrity)

| # | REQ | Why critical |
|---|-----|----------------|
| 1 | **AC-23** | Member privacy only weakly evidenced (source match); no cross-member access denial |
| 2 | **AC-24** | Document-upload prohibition completely **UNTESTED** |
| 3 | **AC-11** | Recovery phone can be marked pending without proving OTP completion before verified use |

### HIGH_TEST_GAPS

| # | REQ | Why high |
|---|-----|----------|
| 1 | **AC-13** | Dual member/admin experience **UNTESTED** |
| 2 | **AC-25** | Immutable `member_id` history not proven after Church ID/contact change |
| 3 | **AC-12** | Multi-admin coexistence not proven (only single-actor permission denies) |
| 4 | **AC-07** | Password recovery email-fallback / verified-contact completeness partial |
| 5 | **BB-CHURCH-ID-CASE-NORM** | Case-insensitive Church ID matching implemented but **UNTESTED** |
| 6 | **BB-ADMIN-SEARCH** | Admin search (FR-20) plumbing-only |

---

## 6. Counts

### BlessBoard requirement set

- AC-01..AC-25 = **25**
- Extras (§2.1) = **8**
- **BB_REQUIREMENTS = 33**

| Class | Count | IDs |
|-------|------:|-----|
| COVERED | **24** | AC-01..06,08..10,14..22; BB-NO-AUTOMERGE, BB-STATUS-SPLIT, BB-SEC-RATE, BB-ENUM-SAFE, BB-QR-OPAQUE, BB-WEBSITE-ENGINE |
| PARTIAL | **4** | AC-07, AC-11, AC-12, AC-25 |
| TEST_EXISTS_BUT_WEAK → footer PARTIAL | **2** | AC-23, BB-ADMIN-SEARCH |
| UNTESTED | **3** | AC-13, AC-24, BB-CHURCH-ID-CASE-NORM |
| NOT_IMPLEMENTED | **0** | — |

Footer roll-up (WEAK folded into PARTIAL as required by footer fields):

- BB_COVERED = **24**
- BB_PARTIAL = **6** (4 PARTIAL + 2 WEAK)
- BB_UNTESTED = **3**
- BB_NOT_IMPLEMENTED = **0**

### ActiveClinic requirement set

- Inventory FEATURE_IDs scored = **5**
- Criteria-level register = **SPEC_GAP** (not counted as COVERED)

| Class | Count |
|-------|------:|
| COVERED | **4** |
| PARTIAL | **1** (AC-MW-HUB) |
| UNTESTED | **0** |
| NOT_IMPLEMENTED | **0** |

- AC_REQUIREMENTS = **5**
- AC_COVERED = **4**
- AC_PARTIAL = **1**
- AC_UNTESTED = **0**
- AC_NOT_IMPLEMENTED = **0**

### Gap severity footer

- CRITICAL_TEST_GAPS = **3**
- HIGH_TEST_GAPS = **6**

---

## 7. Caveats

1. Assertions inspected statically in test sources; full suite not re-executed this audit.
2. Many UI “ships Stitch marker” tests are intentionally excluded from COVERED unless paired with domain/HTTP behavioral asserts.
3. Gate docs claiming product-area PASS are **not** treated as coverage evidence without matching tests.
4. ActiveClinic public/editor/hub tests prove presentation/platform constraints strongly; they do **not** replace a missing AC acceptance-criteria register (`SPEC_GAP`).

---

BB_REQUIREMENTS=33
BB_COVERED=24
BB_PARTIAL=6
BB_UNTESTED=3
BB_NOT_IMPLEMENTED=0
AC_REQUIREMENTS=5
AC_COVERED=4
AC_PARTIAL=1
AC_UNTESTED=0
AC_NOT_IMPLEMENTED=0
CRITICAL_TEST_GAPS=3
HIGH_TEST_GAPS=6
FINAL=V2_04_FEATURE_TEST_COVERAGE_AUDIT_COMPLETE
