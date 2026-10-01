# V2.04 Spec ↔ Implementation Gap Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT` |
| **VERSION** | **2.04** |
| **BRANCH** | `V4` |
| **Mode** | **READ-ONLY** (no code changes) |
| **Inputs** | `docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md`, `docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md`, Canonical Member Feature Spec (FR/AC/BR + Decision Register), V4 source/migrations/routes/services/templates |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT_COMPLETE`** |

---

## 0. Method and classification

Compared **canonical BlessBoard V2.04 Member Feature Specification** requirements to code on `V4`.

| Class | Meaning |
|-------|---------|
| **FULL** | Spec behavior present in domain/HTTP/schema (not merely a comment) |
| **PARTIAL** | Core path present; material MUST dimension incomplete |
| **ABSENT** | Required behavior not found |
| **CONTRADICTS_SPEC** | Implementation actively violates a MUST rule |
| **DEFERRED** | Spec marks DEFER / non-goal / RECOMMENDED-defer; not a V2.04 defect |
| **UNVERIFIABLE** | Cannot confirm without runtime/data not inspectable here |

**Rules**

- FOUNDATION / RECOMMENDED / DEFER are **not** release blockers unless a MUST depends on them and is broken.
- Test gaps from the coverage audit are recorded as **TEST_GAP** where implementation is FULL but automation is weak/missing.
- ActiveClinic has **no** FR/AC/BR V2.04 register → criteria-level **SPEC_GAP** (see §6); not mixed into BB requirement totals.

**Primary implementation hubs**

- Domain: `blessBoardMemberDomainService.js`, `blessBoardMemberPortalAuthService.js`, `memberPortalService.js`
- Attendance: `src/blessboard/services/attendance/*`
- Requests: `src/platform/requestApproval/*`, `joinRequest/*`
- Schema: `046_person_foundation.sql`, `047_approval_request_foundation.sql`, `119–122` blessboard migrations
- UI: `views/blessboard/v5/member*`, `branch-admin/member*`, `attendance/*`, `join-requests/*`

---

## 1. Spec-vs-code checklist (thematic)

| Area | Spec expectation | Implementation verdict | Notes |
|------|------------------|------------------------|-------|
| Person ≠ membership | Separate person/account from church membership | **FULL** | `platform.persons` + `platform_person_id`; comments forbid equating person with membership |
| Immutable `member_id` FKs | History FKs use member UUID not Church ID | **FULL** | `attendance_check_ins.member_id` → `blessboard.members(id)`; join memberships use `member_id` |
| Church ID uniqueness | Unique within church org, not global | **FULL** | Unique index `(church_id, lower(trim(member_number)))` |
| Membership ≠ portal status | Separate enums | **FULL** | `status` vs `portal_access_status` |
| Multiple memberships | Structurally possible | **FULL** (FOUNDATION) | `platform_person_id` non-unique; multiple member rows possible; switching UX DEFERRED |
| No self-registration | Staff/platform only | **FULL** | `assertStaffActor` / `SELF_CREATE_FORBIDDEN` |
| Exact normalized match | No fuzzy auto-auth | **FULL** | Name normalize + exact phone; email optional exact when provided |
| Email optional | Activation without email | **FULL** | Verify path; synthetic email only for auth user row |
| Password policy | 8+ / upper / special | **FULL** | `validateMemberPortalPassword` |
| Church ID + password login | Returning login | **FULL** | `authenticateMemberByChurchId` |
| Verified recovery | Phone OTP; email fallback where available | **PARTIAL** | Phone OTP implemented; **email fallback not implemented** |
| Rate limit / enumeration | Rate + neutral errors | **FULL** | Activation/recovery rate buckets; neutral messages |
| Session invalidation | Block / reset revoke sessions | **FULL** | Block + recovery revoke paths |
| Profile allowed fields | Spec list editable | **FULL** | `MEMBER_SELF_EDITABLE_FIELDS` + address/NOK columns |
| Church ID / branch protected | Not member-editable | **FULL** | Domain + portal reject |
| Phone verify before recovery use | OTP then promote | **FULL** | `start/completeMemberPhoneVerification` promote pending → verified |
| RBAC not title-only | Permission catalogue | **FULL** | `members.*`, `attendance.*` keys; role grants in migrations |
| Named permissions | view/create/edit/block/church_id.manage; attendance.record/correct; requests.review | **PARTIAL** | `members.manage_church_id` (not `church_id.manage`); V2.04 check-in uses `attendance.check_in` (+ legacy `attendance.record`); **`requests.review` key absent** — uses `events.manage` / managed IDs |
| Resource scoping | Leaders scoped to managed resources | **PARTIAL** | Scope helper exists; **`resolveManagedResourceIds` not wired** at mount → leaders without broad perm fail-closed |
| Multiple admins | No one-admin limit | **FULL** | Permission grants to admin role catalogue |
| Dual member/admin access | Both destinations for dual-role users | **PARTIAL** | Separate `/member` and `/branch-admin` shells; **no dual-role cross-links / destination UX** |
| Attendance event context | Session/event + method + recorder | **FULL** | Session domain + check-in methods |
| Scoped manual recording | Authz + least privilege | **PARTIAL** | Permission-gated; **cell-leader narrow scope not productized** |
| Correction history | Auditable corrections | **FULL** | Correction service + audit table/UI |
| Time-limited QR / member scan / no PII / duplicate | As specified | **FULL** | TTL/exp, opaque claims, unique active (session, member) |
| Request model + statuses | Reusable + PENDING/APPROVED/REJECTED/CANCELLED | **FULL** | Platform approval_requests + join adapter |
| Self-approval denial | Backend prohibit | **FULL** | Platform + join adapter |
| Privileged audit | Create/block/Church ID/transfer/attendance/approvals | **FULL** | `recordSharedPlatformAudit` / correction decisions |
| Own-member + tenant boundary | Privacy + isolation | **FULL** | `requireActiveMemberForTenant`; domain tenant checks |
| Member document upload disabled | Ordinary member journey | **FULL** | No file inputs under `views/blessboard/v5/member`; restriction by absence |

---

## 2. Classification matrix — FR-01..FR-20

| ID | Class | One-line evidence |
|----|-------|-------------------|
| FR-01 | **FULL** | Staff create only; self-create forbidden |
| FR-02 | **FULL** | Org-scoped unique Church ID; member cannot edit |
| FR-03 | **FULL** | Activation Name+Phone+Church ID; email optional |
| FR-04 | **FULL** | Password policy enforced |
| FR-05 | **FULL** | Church ID + password login |
| FR-06 | **PARTIAL** | Phone OTP recovery works; email fallback missing |
| FR-07 | **FULL** | `lostChurchIdGuidance` / no automated recovery |
| FR-08 | **FULL** | Member dashboard/shell M20 |
| FR-09 | **FULL** | Self-edit allowlist; Church ID/branch protected |
| FR-10 | **FULL** | Portal block/unblock; membership preserved |
| FR-11 | **FULL** | Multi-admin via RBAC catalogue |
| FR-12 | **PARTIAL** | Both portals exist; dual-role destination UX incomplete |
| FR-13 | **PARTIAL** | Manual check-in + RBAC; cell-scoped least privilege incomplete |
| FR-14 | **FULL** | Session QR TTL, member scan, opaque token, duplicates |
| FR-15 | **FULL** | Ministry/department join requests |
| FR-16 | **PARTIAL** | Approve/reject + self-deny; resource-leader injector unwired |
| FR-17 | **FULL** | Portal scoped to authenticated member |
| FR-18 | **FULL** | No ordinary-member upload surface |
| FR-19 | **FULL** | Audits on privileged member/attendance/approval actions |
| FR-20 | **FULL** | Admin directory `q` search by Church ID/name/phone in repo/routes |

---

## 3. Classification matrix — AC-01..AC-25

| ID | Class | Notes |
|----|-------|-------|
| AC-01 | **FULL** | Self-create forbidden |
| AC-02 | **FULL** | Authorized create + Church ID |
| AC-03 | **FULL** | Activation without email |
| AC-04 | **FULL** | Failed verify does not create membership |
| AC-05 | **FULL** | Weak passwords rejected |
| AC-06 | **FULL** | Returning login |
| AC-07 | **PARTIAL** | Recovery via phone OTP; email fallback absent |
| AC-08 | **FULL** | No public Church ID recovery |
| AC-09 | **FULL** | Church ID protected |
| AC-10 | **FULL** | Official branch protected |
| AC-11 | **FULL** | Pending phone + complete OTP promotes verified contact |
| AC-12 | **FULL** | Permission model supports multiple admins |
| AC-13 | **PARTIAL** | Dual experience UX/linking incomplete (see FR-12) |
| AC-14 | **FULL** | Block preserves membership/history |
| AC-15 | **FULL** | Session revoke + blocked gate |
| AC-16 | **PARTIAL** | Manual attendance authorized; cell scope incomplete |
| AC-17 | **FULL** | Time-limited QR check-in |
| AC-18 | **FULL** | Duplicate prevention |
| AC-19 | **FULL** | Correction + audit |
| AC-20 | **FULL** | Join → PENDING |
| AC-21 | **PARTIAL** | Broad reviewers work; managed-resource leaders need injector |
| AC-22 | **FULL** | Self-approval denied |
| AC-23 | **FULL** | Own-member portal boundary (automation weak — TEST_GAP) |
| AC-24 | **FULL** | Member upload disabled (TEST_GAP: no explicit negative test) |
| AC-25 | **FULL** | Historical FKs on `members.id` |

---

## 4. Classification matrix — BR-01..BR-11

| ID | Class | Notes |
|----|-------|-------|
| BR-01 | **FULL** | Church-scoped unique index |
| BR-02 | **FULL** | Alphanumeric IDs; case-insensitive match via `lower(trim)` |
| BR-03 | **FULL** | Hard-block ID dup; warn likely person dup; no auto-merge |
| BR-04 | **FULL** | Create vs activation separated |
| BR-05 | **FULL** | Membership vs portal statuses |
| BR-06 | **FULL** | Block preserves history |
| BR-07 | **FULL** | No ordinary hard-delete path exposed (FOUNDATION) |
| BR-08 | **FULL** | Admin branch transfer; attendance not rewritten (FOUNDATION) |
| BR-09 | **DEFERRED** | Full cross-church transfer UX out of scope; isolation prevents private-data move (FOUNDATION rule held) |
| BR-10 | **FULL** | Schema allows multiple member rows / person links (FOUNDATION; switching UX deferred) |
| BR-11 | **FULL** | Visitor auto-membership forbidden |

---

## 5. Decision Register — MUST items

Classes for MUST decisions (FOUNDATION/RECOMMENDED/DEFER listed only where needed for clarity):

| # | Area | Class |
|---|------|-------|
| 1–5 | Church ID uniqueness/format/import; who creates; minimum record | **FULL** |
| 6–9 | Email optional; exact match; activation split; password | **FULL** |
| 10 | Forgot password (phone OTP + email fallback) | **PARTIAL** |
| 11–14 | Lost contact/ID; Church ID change; duplicates | **FULL** |
| 15 | Duplicate merge | **DEFERRED** |
| 16–19 | Editable name/phone/profile; branch not member-editable | **FULL** |
| 20 | Membership status foundation | **FULL** (FOUNDATION) |
| 21–22 | Portal status; blocking | **FULL** |
| 23 | Prefer archive over hard delete | **FULL** (FOUNDATION) |
| 24–26 | Multi-admin; RBAC; leader+member coexist | **FULL** |
| 27 | Separate Member vs Management destinations | **PARTIAL** |
| 28–30 | Multi-membership / transfers foundations | **FULL** / **DEFERRED** UX as noted in BR-09/10 |
| 31–32 | Attendance record + event types | **FULL** / **FULL** (FOUNDATION) |
| 33 | Manual attendance least privilege | **PARTIAL** |
| 34, 36–37 | QR model/validity/correction | **FULL** |
| 35 | Staff-scans-member QR | **DEFERRED** |
| 38 | Ministry joining request flow | **FULL** |
| 39 | Approval scope for leaders | **PARTIAL** |
| 40 | Generic request engine | **FULL** (FOUNDATION) |
| 41–42 | Statuses; self-approval | **FULL** |
| 43 | Notifications in-app first | **DEFERRED** / RECOMMENDED (not blocker) |
| 44–45 | Audit; privacy | **FULL** |
| 46 | Cell leader scope | **PARTIAL** / **UNVERIFIABLE** if cells unused (`MUST IF CELLS`) |
| 47 | Member uploads disabled | **FULL** |
| 48 | Bulk import UI | **DEFERRED** |
| 49 | Visitor boundary | **FULL** |
| 50 | Full Visitor journey | **DEFERRED** |
| 51–52 | Session security; rate limiting | **FULL** |
| 53–55 | Admin search; history keys; Platform Admin separation | **FULL** |

---

## 6. ActiveClinic

| ID | Class | Notes |
|----|-------|-------|
| AC V2.04 FR/AC/BR register | **ABSENT** as contract / inventory **SPEC_GAP** | No canonical AC acceptance criteria to classify |
| Inventory features (website Stitch, patient foundation) | Implemented at feature level | See inventory + coverage audits; **not** counted in BB FULL/PARTIAL totals |

---

## 7. Gap register (non-FULL / actionable)

| ID | EXPECTED | ACTUAL | CODE_EVIDENCE | TEST_EVIDENCE | SEVERITY | TYPE | RECOMMENDED_ACTION |
|----|----------|--------|---------------|---------------|----------|------|--------------------|
| FR-06 / AC-07 / DR-10 | Forgot Password via verified phone OTP **and email fallback where available** | Phone OTP recovery only; missing phone → neutral failure; no email recovery channel | `beginMemberPasswordRecovery` requires `member.phoneNormalized` (`blessBoardMemberPortalAuthService.js`) | Auth recovery tests cover phone OTP only | **MEDIUM** | IMPLEMENTATION_GAP | Add email OTP/fallback when `emailDisplay` verified; keep enumeration-safe |
| FR-12 / AC-13 / DR-27 | Dual-role user has clear Member Portal **and** Church Management destinations | Separate shells (`/member`, `/branch-admin`); **no** cross-links or dual-role destination UX | `member-shell-start.ejs`, `branch-admin-shell-start.ejs` — no reciprocal admin/member entry | Coverage: UNTESTED dual-role journey | **HIGH** | IMPLEMENTATION_GAP | Add dual-role entry points when actor has both member portal + admin permissions; document identity linking |
| FR-13 / AC-16 / DR-33 / DR-46 | Manual attendance least-privilege (cell leaders scoped to cells/events they manage) | Session check-in gated by `attendance.check_in` / manage_session; **no cell resource scope** parallel to join `managedResourceIds` | `attendanceValidationService.js`, `attendanceCheckInAdminRoutes.js` | Attendance suites cover permission deny, not cell scope | **MEDIUM** | IMPLEMENTATION_GAP | When cells ship, inject cell/event managed scope into check-in authorize |
| FR-16 / AC-21 / DR-39 | Ministry/department leaders review **only** resources they manage; admins broader | Scope helper + fail-closed exist, but server mounts join router **without** `resolveManagedResourceIds` → non-broad actors get `[]` and cannot review | `v5FoundationServer.js` `createJoinRequestAdminRouter({...})` omits injector; `joinRequestAdminRoutes.js` lines 79–168 | Request-admin tests pass scoped IDs **via deps**; production mount lacks injector | **HIGH** | IMPLEMENTATION_GAP | Implement/wire `resolveManagedResourceIds` (ministry_leaders or equivalent); keep fail-closed |
| DR-perm-name / DOC | Spec permission `members.church_id.manage` | Code/catalogue `members.manage_church_id` | `memberDomainConstants.js`, migration `120` | Domain tests assert code key | **LOW** | DOC_GAP | Align spec text to `members.manage_church_id` (or add alias) |
| DR-perm-requests | Spec permission `requests.review` | Join review uses `events.manage` (+ managed resources); no `requests.review` key | `blessBoardJoinRequestConstants.js` `REVIEW_BROAD: "events.manage"` | Request suites use broader/managed flags | **LOW** | DOC_GAP | Document actual keys or add `requests.review` alias in catalogue |
| CREATE-UI-EXTRA | Stitch Add Member collects gender/baptism | UI required in `member-add.ejs`; **no** gender/baptism columns in `120_member_domain_v204.sql` | `views/.../member-add.ejs`; migration `120` | Prior gate KNOWN_GAPS; m01-m02 form validation | **MEDIUM** | IMPLEMENTATION_GAP | Persist fields or remove/optionalize UI until schema exists |
| AC-23 TEST | Privacy proven by automation | Implementation own-member scoped; tests mostly wiring | `requireActiveMemberForTenant` / portal routes | Coverage: TEST_EXISTS_BUT_WEAK | **MEDIUM** | TEST_GAP | Add cross-member profile access denial test |
| AC-24 TEST | Upload prohibition proven | Implementation has no member upload UI | `views/blessboard/v5/member/**` no `type=file` | Coverage: UNTESTED | **LOW** | TEST_GAP | Assert absence / reject upload route if any |
| AC-11 TEST | Phone OTP completion covered | Implementation complete; tests only pending + `start…` string | `completeMemberPhoneVerification` in `memberPortalService.js` | Coverage: PARTIAL | **MEDIUM** | TEST_GAP | Behavioral OTP success/fail tests |
| AC-25 TEST | History survives Church ID change | Schema FK correct; no behavioral change test | migration `121` `member_id` FK | Coverage: PARTIAL | **LOW** | TEST_GAP | Change Church ID then load attendance by member id |
| BB-CHURCH-ID-CASE TEST | Case-insensitive login proven | Implemented `lower(trim(member_number))` | `memberIdentityRepository.findMemberByChurchAndNumber` | Coverage: UNTESTED | **LOW** | TEST_GAP | Login/activate with case variants |
| DR-15 / 35 / 50 / 48 | Deferred capabilities | Not implemented by design | Spec Decision Register | N/A | — | — | Keep backlog; **not defects** |
| AC-SPEC | AC V2.04 AC/FR register | Not in repo | Inventory SPEC_NOT_FOUND | N/A | **MEDIUM** | SPEC_GAP | Author AC V2.04 feature spec before AC criteria auditing |

**CONTRADICTS_SPEC:** none identified for MUST behaviors (permission *names* differ; behavior keys are intentional catalogue choices).

**ABSENT (sub-capability):** email recovery fallback channel (rolled into FR-06 PARTIAL, not a standalone ABSENT FR).

---

## 8. Severity roll-up (gap rows only)

| Severity | Count | IDs |
|----------|------:|-----|
| **BLOCKER** | **0** | — |
| **HIGH** | **2** | Dual-role destinations (FR-12/AC-13/DR-27); resource-scoped join reviewer injector (FR-16/AC-21/DR-39) |
| **MEDIUM** | **6** | Email recovery fallback; cell attendance scope; gender/baptism persistence; AC-23/AC-11 test gaps; AC SPEC_GAP |
| **LOW** | **5** | Permission naming docs; `requests.review` doc; AC-24/AC-25/case-norm test gaps |

Deferred Decision Register items are **not** counted as severity defects.

---

## 9. Requirement classification counts

**Population:** FR-01..20 (20) + AC-01..25 (25) + BR-01..11 (11) + Decision register rows audited in §5 (43) = **99** IDs. Each ID has exactly one class.

| Class | Count | Members |
|-------|------:|---------|
| FULL | **80** | All remaining IDs not listed below |
| PARTIAL | **12** | FR-06, FR-12, FR-13, FR-16; AC-07, AC-13, AC-16, AC-21; DR-10, DR-27, DR-33, DR-39 |
| ABSENT | **0** | — |
| CONTRADICTS_SPEC | **0** | — |
| DEFERRED | **6** | BR-09; DR-15, DR-35, DR-43, DR-48, DR-50 |
| UNVERIFIABLE | **1** | DR-46 (`MUST IF CELLS`) |

Sum check: 80 + 12 + 0 + 0 + 6 + 1 = **99**.

---

## 10. Relationship to test coverage audit

| Implementation | Typical test status (prior audit) |
|----------------|-----------------------------------|
| FULL | Often COVERED; some TEST_GAP (AC-23/24/11/25, case-norm) |
| PARTIAL | Matches PARTIAL/UNTESTED automation themes (recovery email, dual UX, cell scope, reviewer injector) |
| DEFERRED | Not defects |

Do **not** treat TEST_GAP alone as IMPLEMENTATION_GAP.

---

FULL=80
PARTIAL=12
ABSENT=0
CONTRADICTS_SPEC=0
DEFERRED=6
BLOCKERS=0
HIGH=2
MEDIUM=6
LOW=5
FINAL=V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT_COMPLETE
