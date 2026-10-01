# BlessBoard V2.04 — Manual QA Handoff (Frozen Candidate)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_MANUAL_QA_HANDOFF` |
| **VERSION** | **2.04** |
| **BRANCH** | **V4** |
| **Frozen** | 2026-10-01 |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) |

---

## 1. Candidate verification

```
EXPECTED_SHA=b8e9f4a196f381f3be57e8084b3c6905a7bbeb41
CURRENT_SHA=b8e9f4a196f381f3be57e8084b3c6905a7bbeb41
SHA_MATCH=PASS
```

Freeze applies to the **committed** application tree at `APPLICATION_CANDIDATE_SHA` only.

**QA environment rule:** run manual QA from a **clean checkout** of this SHA (no local uncommitted `src/`, `views/`, `public/`, `db/`, or `tests/` overlays). Any application-code change after freeze **invalidates** this candidate and requires a new SHA + regression.

At freeze recording time, the developer working tree may contain uncommitted application/docs changes relative to HEAD. Those changes are **not** part of this frozen candidate.

---

## 2. Frozen QA baseline

```
VERSION=2.04
BRANCH=V4
APPLICATION_CANDIDATE_SHA=b8e9f4a196f381f3be57e8084b3c6905a7bbeb41
STITCH_SCREENS=45
STITCH_PARITY=45/45
AUTOMATED_TESTS=294/294
RELEASE_BLOCKERS=0
KNOWN_NON_BLOCKING_GAPS=0
PRODUCTION=UNTOUCHED
```

### Authoritative references

| Doc | Role |
|-----|------|
| `docs/qa/V2_04_BB_FINAL_QA_RELEASE_GATE.md` | Final automated gate / RC decision |
| `docs/qa/V2_04_BB_STITCH_RECONCILIATION.md` | Canonical 45 inventory |
| `docs/qa/V2_04_BB_STITCH_PARITY_P1.md` … `P5_ADJUDICATION.md` | Parity + adjudication (P5 holds 45/45) |
| `docs/qa/V2_04_BB_MEMBER_FINAL_GATE.md` | Earlier member functional gate |

### Automated baseline (final gate pack)

- **TEST_FILES=27** · **TEST_CASES=294** · **PASS=294** · **FAIL=0** · **SKIP=0**
- Architecture: `npm run test:architecture` → 7/7 (recorded in final gate)
- AC shared smoke included in the 27-file pack (`v2-04-ac-patient-domain`, product token cascade)

### Product gates (all PASS for this freeze)

Member management · Member auth · Member portal · Attendance · Requests · RBAC · Tenant isolation · Security · Theme · Architecture · Migrations · AC shared regression

---

## 3. Release rule (post-freeze)

Any **application-code** change after this freeze requires:

1. **New** `APPLICATION_CANDIDATE_SHA`
2. Affected automated regression re-run
3. Parity regression where UI changed
4. Updated QA candidate record / handoff revision

**Documentation-only** commits may be recorded separately **without** changing the frozen application candidate, provided they do not change runtime/application behavior.

---

## 4. Manual QA result format

For every scenario, record:

| Field | |
|-------|--|
| **ID** | e.g. QA01 |
| **AREA** | Member / Auth / Portal / Attendance / Requests / RBAC / Isolation / Visual / AC |
| **PRECONDITION** | Tenants, users, data |
| **ROLE** | Actor(s) |
| **STEPS** | Numbered actions |
| **EXPECTED RESULT** | Pass criteria |
| **ACTUAL RESULT** | What happened |
| **PASS/FAIL/BLOCKED** | One of three |
| **BUG ID** | Tracker ID if fail |
| **SEVERITY** | S0–S4 |
| **NOTES** | Evidence, screenshots, env |

### Severity

| Code | Meaning |
|------|---------|
| **S0** | BLOCKER — ship stop |
| **S1** | CRITICAL — major function broken / security |
| **S2** | MAJOR — significant workflow gap |
| **S3** | MINOR — limited impact |
| **S4** | COSMETIC — visual only |

### Overall manual QA decision (fill at end)

```
MANUAL_QA_RESULT=PASS|FAIL|BLOCKED
S0_OPEN=
S1_OPEN=
CANDIDATE_STILL_VALID=YES|NO
```

---

## 5. Scenario pack (QA01–QA21)

Practical end-to-end pack (not 45 isolated screen checks). Use controlled TESTING tenants only. **Do not touch production.**

---

### QA01 — MEMBER CREATION

| Field | Content |
|-------|---------|
| **ID** | QA01 |
| **AREA** | Member management |
| **PRECONDITION** | Branch admin (or equivalent) with `members.create` / `members.view` on Church A / Branch A. Directory reachable. |
| **ROLE** | Authorized church staff |
| **STEPS** | 1. Open Members Directory (M01). 2. Add Member (M02). 3. Enter unique person details + Church ID. 4. Proceed through duplicate check (M03) if prompted. 5. Review (M04). 6. Create → confirmation (M05). 7. Open admin profile (M06). |
| **EXPECTED RESULT** | Member exists with Church ID, official branch, membership **active** (or expected lifecycle), portal **NOT_ACTIVATED**. Profile/history available. No portal login yet. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA02 — DUPLICATE PREVENTION

| Field | Content |
|-------|---------|
| **ID** | QA02 |
| **AREA** | Member management / person duplicate |
| **PRECONDITION** | Existing member with known Church ID, phone, and name/DOB. Staff create permission. |
| **ROLE** | Authorized church staff |
| **STEPS** | 1. Attempt create with **same Church ID**. 2. Attempt create with matching phone (different Church ID). 3. Attempt create with matching name + DOB where policy applies. |
| **EXPECTED RESULT** | Duplicate Church ID **hard-blocked**. Possible phone / name-DOB matches **warned** for review. **No automatic merge**. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA03 — FIRST PORTAL ACTIVATION

| Field | Content |
|-------|---------|
| **ID** | QA03 |
| **AREA** | Member auth |
| **PRECONDITION** | Staff-created member with Church ID, full name, verified contact phone; portal NOT_ACTIVATED; no prior password. |
| **ROLE** | Member (first-time) |
| **STEPS** | 1. Member Login → First-Time Verification (Church ID + name + phone). 2. Create Password (policy: ≥8, uppercase, special). 3. Complete activation → Member Homepage (M20). |
| **EXPECTED RESULT** | Email optional. Existing membership reused. **No new membership** created. Portal becomes active. Homepage shows church context. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA04 — RETURNING LOGIN + BLOCKING

| Field | Content |
|-------|---------|
| **ID** | QA04 |
| **AREA** | Member auth / admin access |
| **PRECONDITION** | Activated member with password. Staff with portal block capability. |
| **ROLE** | Member + authorized admin |
| **STEPS** | 1. Member logs in with Church ID + password. 2. Admin blocks portal access. 3. Member retries portal. 4. Confirm membership still active. 5. Unblock if supported; member logs in again. |
| **EXPECTED RESULT** | Successful login before block. After block: portal denied; **membership preserved**; sessions invalidated as designed; audit recorded. Unblock restores access. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA05 — PASSWORD RECOVERY

| Field | Content |
|-------|---------|
| **ID** | QA05 |
| **AREA** | Member auth |
| **PRECONDITION** | Activated member with verified contact. |
| **ROLE** | Member |
| **STEPS** | 1. Forgot Password → enter Church ID. 2. Recovery verification / OTP. 3. Try invalid OTP. 4. Try expired OTP if exercisable. 5. Reset with valid OTP + new password. 6. Login with new password; confirm old password fails. |
| **EXPECTED RESULT** | Privacy-preserving (non-enumerating) responses. OTP required. New password works; old does not. Lost Church ID does **not** offer automated recovery that leaks membership. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA06 — MEMBER PROFILE

| Field | Content |
|-------|---------|
| **ID** | QA06 |
| **AREA** | Member portal |
| **PRECONDITION** | Logged-in active member. |
| **ROLE** | Member |
| **STEPS** | 1. Open My Profile (M21). 2. Edit Profile (M22). 3. Change permitted fields (e.g. preferred name, email, address). 4. Save and re-open profile. |
| **EXPECTED RESULT** | Church ID **read-only**. Official membership branch **read-only**. Approved edits persist. Member sees own data only. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA07 — PHONE CHANGE

| Field | Content |
|-------|---------|
| **ID** | QA07 |
| **AREA** | Member portal |
| **PRECONDITION** | Logged-in member with current verified phone. |
| **ROLE** | Member |
| **STEPS** | 1. Edit phone to a new number. 2. Complete OTP verification (M23). 3. Confirm profile shows verified new number. 4. Attempt to leave unverified number as primary without OTP (if UI allows). |
| **EXPECTED RESULT** | Unverified number is **not** silently accepted as verified contact. OTP required for phone change. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA08 — MINISTRY REQUEST

| Field | Content |
|-------|---------|
| **ID** | QA08 |
| **AREA** | Portal / requests |
| **PRECONDITION** | Active member; joinable ministry/department configured for request policy. |
| **ROLE** | Member |
| **STEPS** | 1. Ministries list → Ministry Detail. 2. Request to Join. 3. Open My Requests → Request Detail. |
| **EXPECTED RESULT** | Request status **PENDING**. **No** automatic ministry membership. Member sees own request only. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA09 — REQUEST APPROVAL

| Field | Content |
|-------|---------|
| **ID** | QA09 |
| **AREA** | Requests admin |
| **PRECONDITION** | PENDING join request from QA08. Reviewer with `requests.review` (or product equivalent) for that resource. |
| **ROLE** | Authorized ministry/department reviewer (not the requesting member) |
| **STEPS** | 1. Requests Inbox (R01). 2. Open review (R02). 3. Approve (R03). 4. Check ministry members (R04) / member portal request detail. |
| **EXPECTED RESULT** | Relationship created. Decision audit/history present. Member sees **approved** result. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA10 — REQUEST REJECTION / SELF-APPROVAL

| Field | Content |
|-------|---------|
| **ID** | QA10 |
| **AREA** | Requests admin |
| **PRECONDITION** | Separate PENDING request for rejection. Where dual-role exists, attempt self-approval path. |
| **ROLE** | Reviewer; dual-role member/leader if available |
| **STEPS** | 1. Reject a PENDING request with reason. 2. Confirm no membership relationship. 3. Attempt self-approval of own request if role allows UI access. |
| **EXPECTED RESULT** | Rejection does **not** create relationship. Self-approval **denied**. Decision audit preserved. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA11 — ATTENDANCE SESSION

| Field | Content |
|-------|---------|
| **ID** | QA11 |
| **AREA** | Attendance |
| **PRECONDITION** | Staff with session manage / attendance permissions on Branch A. |
| **ROLE** | Authorized attendance staff |
| **STEPS** | 1. Create session (draft). 2. Open session. 3. View dashboard. |
| **EXPECTED RESULT** | Lifecycle DRAFT → OPEN visible. Session info correct (branch, time, status). |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA12 — MANUAL ATTENDANCE

| Field | Content |
|-------|---------|
| **ID** | QA12 |
| **AREA** | Attendance |
| **PRECONDITION** | OPEN session from QA11; known active member. |
| **ROLE** | Staff with `attendance.record` (or check-in) |
| **STEPS** | 1. Manual check-in search → select member → record. 2. Repeat identical check-in. |
| **EXPECTED RESULT** | First succeeds. Duplicate does **not** create a second attendance record (idempotent / already checked-in). |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA13 — MEMBER QR ATTENDANCE

| Field | Content |
|-------|---------|
| **ID** | QA13 |
| **AREA** | Attendance |
| **PRECONDITION** | OPEN session; QR display available; member device/session for scan/redeem path. |
| **ROLE** | Staff (QR display) + Member (scan/redeem) |
| **STEPS** | 1. Display session QR (A05). 2. Member completes QR check-in (A06). 3. Re-scan / re-submit. 4. Inspect QR payload/token (no raw PII). |
| **EXPECTED RESULT** | Valid check-in once. Already checked-in state on repeat. QR signed/time-limited; **no** raw member PII in QR. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA14 — ATTENDANCE EXCEPTIONS

| Field | Content |
|-------|---------|
| **ID** | QA14 |
| **AREA** | Attendance |
| **PRECONDITION** | OPEN session; members from home and other branch; ability to expire/invalidate QR; ability to close later. |
| **ROLE** | Attendance staff + members as needed |
| **STEPS** | 1. Late arrival check-in. 2. Other-branch member check-in. 3. Expired/invalid QR. 4. After close (or with closed session): normal check-in attempt. |
| **EXPECTED RESULT** | Late handled per policy (recorded/flagged, not silent wrong deny). Cross-branch recorded without **silently** changing membership branch. Invalid/expired QR rejected. Closed session rejects normal check-in. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA15 — PEAK CHECK-IN

| Field | Content |
|-------|---------|
| **ID** | QA15 |
| **AREA** | Attendance |
| **PRECONDITION** | OPEN session; several members available. |
| **ROLE** | Staff using Peak workflow (A07) |
| **STEPS** | 1. Rapid check-in for multiple distinct members. 2. Attempt duplicate for one already checked in. |
| **EXPECTED RESULT** | Fast repeat flow; correct members; no duplicate attendance; **same** validation rules as manual/QR shared path. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA16 — CLOSE + LOCK

| Field | Content |
|-------|---------|
| **ID** | QA16 |
| **AREA** | Attendance |
| **PRECONDITION** | OPEN session with some attendance. |
| **ROLE** | Authorized session manager |
| **STEPS** | 1. Close session. 2. Attempt normal check-in. 3. Lock session (or verify locked state). 4. Attempt mutation/check-in. |
| **EXPECTED RESULT** | CLOSED rejects normal check-in. LOCKED is protected final state. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA17 — ATTENDANCE CORRECTION

| Field | Content |
|-------|---------|
| **ID** | QA17 |
| **AREA** | Attendance |
| **PRECONDITION** | Closed/open session with an attendance record; user with `attendance.correct`. |
| **ROLE** | Authorized corrector |
| **STEPS** | 1. Open correction form. 2. Submit change **with reason**. 3. View confirmation + audit timeline. |
| **EXPECTED RESULT** | Reason, actor, timestamp recorded. Original history preserved. Corrected value visible. Audit generated. Unauthorized user cannot correct. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA18 — RBAC NEGATIVE TEST

| Field | Content |
|-------|---------|
| **ID** | QA18 |
| **AREA** | RBAC |
| **PRECONDITION** | Ordinary member account; limited staff role lacking members.create / attendance.correct / requests.review as applicable. |
| **ROLE** | Ordinary member; limited staff |
| **STEPS** | 1. Attempt management URLs (members create/edit/block, attendance correct, request review). 2. Confirm UI affordances hidden where expected. 3. Confirm direct POST/GET still denied server-side. |
| **EXPECTED RESULT** | Unauthorized actions unavailable in UI **and** server-side denied. Dual-role does not leak management into member portal context. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA19 — TENANT ISOLATION

| Field | Content |
|-------|---------|
| **ID** | QA19 |
| **AREA** | Tenant isolation |
| **PRECONDITION** | Two churches (Church A / Church B) with members, requests, attendance sessions. |
| **ROLE** | Staff/member of Church A attempting Church B resources |
| **STEPS** | 1. Cross-church member profile/list IDs. 2. Cross-church request detail. 3. Cross-church attendance session/check-in. |
| **EXPECTED RESULT** | No data leakage; no unauthorized mutation; 403/404 as designed. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA20 — RESPONSIVE / VISUAL QA

| Field | Content |
|-------|---------|
| **ID** | QA20 |
| **AREA** | Visual / Stitch parity |
| **PRECONDITION** | Clean candidate deploy/host; Stitch project open for compare. |
| **ROLE** | QA reviewer |
| **STEPS** | At **1440px** and **390px**, walk representative flows and inspect at minimum: **M01, M02, M03, M06, M13–M27, A05–A07, R01, R02**. Compare layout, content, navigation, forms, modals, status states, overflow, touch targets to Stitch. |
| **EXPECTED RESULT** | Matches P5-adjudicated parity (45/45). No S0/S1 visual blockers. Overflow and touch targets acceptable on 390. Accepted embedded/demo differences per P5 remain non-blocking. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

### QA21 — SHARED PLATFORM REGRESSION (ActiveClinic)

| Field | Content |
|-------|---------|
| **ID** | QA21 |
| **AREA** | ActiveClinic / shared platform |
| **PRECONDITION** | AC TESTING tenant available; shared theme/platform surfaces from V2.04. |
| **ROLE** | AC staff / public as applicable |
| **STEPS** | 1. Smoke login/shell and a primary ops or public surface that consumes shared platform CSS/theme. 2. Check copy/tokens for BlessBoard violet/church terminology leakage. |
| **EXPECTED RESULT** | No BB theme or church terminology leaks into AC. Shared platform changes do not break AC smoke path. |
| **ACTUAL RESULT** | _ |
| **PASS/FAIL/BLOCKED** | _ |
| **BUG ID** | _ |
| **SEVERITY** | _ |
| **NOTES** | _ |

---

## 6. Scenario checklist roll-up

| ID | Area | Result |
|----|------|--------|
| QA01 | Member creation | _ |
| QA02 | Duplicate prevention | _ |
| QA03 | First portal activation | _ |
| QA04 | Returning login + blocking | _ |
| QA05 | Password recovery | _ |
| QA06 | Member profile | _ |
| QA07 | Phone change | _ |
| QA08 | Ministry request | _ |
| QA09 | Request approval | _ |
| QA10 | Rejection / self-approval | _ |
| QA11 | Attendance session | _ |
| QA12 | Manual attendance | _ |
| QA13 | Member QR attendance | _ |
| QA14 | Attendance exceptions | _ |
| QA15 | Peak check-in | _ |
| QA16 | Close + lock | _ |
| QA17 | Attendance correction | _ |
| QA18 | RBAC negative | _ |
| QA19 | Tenant isolation | _ |
| QA20 | Responsive / visual | _ |
| QA21 | AC shared regression | _ |

```
MANUAL_QA_SCENARIOS=21
```

---

## 7. Finish marker

```
V2_04_BB_MANUAL_QA_CANDIDATE_FROZEN
```
