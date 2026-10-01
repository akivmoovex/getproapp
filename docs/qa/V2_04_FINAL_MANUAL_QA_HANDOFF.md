# V2.04 Final Manual QA Handoff

**Audience:** Testers  
**Version:** 2.04  
**Date:** 2026-10-02  
**Canonical path:** `docs/qa/V2_04_FINAL_MANUAL_QA_HANDOFF.md`  
**Scope:** RB-QA-01…05 only  
**Sources:** `docs/qa/V2_04_FINAL_MANUAL_QA_5_SCENARIOS.md`, `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md`  
**Env:** TESTING (`*.neuniversity.org`) · tip SHA `54cdb1f76f5a` (or later identity-bound tip) · About Version **2.04**  
**Record results in:** `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md`  
**Do not:** invent evidence · mark PASS without proof · treat unbound/prod hosts as release evidence  
**Invalid path note:** `ocs/qa/...` is not valid — always use `docs/qa/...`

### Shared before you start

1. Confirm About shows **Version 2.04** and Build matches the tip SHA you will cite.  
2. Use TESTING only (not production).  
3. Fill the blank result fields under each scenario when done.

| Base | URL |
|------|-----|
| BlessBoard | `https://blessboard.neuniversity.org` |
| ActiveClinic | `https://activeclinic.neuniversity.org` |
| Hub | `https://neuniversity.org` |

---

## RB-QA-01 — BlessBoard Members FEATURE QA

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-01 |
| **PRODUCT** | BB |
| **PURPOSE** | End-to-end Members MUST pack (create/auth/recovery/block/dual-role/attendance/scoped review/privacy/search/isolation) |
| **PRECONDITIONS** | Identity-bound TESTING tip; one church with staff admin + ordinary member + dual-role (member + HQ/branch admin); second church for isolation |
| **TEST_ACCOUNT_ROLE** | (1) Church staff admin (2) Ordinary member (3) Dual-role member+admin (4) Optional second-church admin |
| **START_URL** | `https://blessboard.neuniversity.org` → HQ / member portal as role requires |

**STEPS**

1. Staff Add Member → create with Church ID; confirm visitor/self-create cannot create membership.  
2. Duplicate Church ID → hard block; likely-person match → warn, no auto-merge.  
3. First-time activate (email optional) + returning Church ID/password login; reject weak password.  
4. Forgot password via verified phone OTP only; Lost Church ID → admin-assisted guidance only.  
5. Member profile edit + pending phone OTP verify; staff block/unblock; blocked session cannot continue.  
6. Dual-role: navigate `/member` ↔ `/hq` both ways without second login.  
7. Attendance: manual check-in + QR; duplicate attempt; correction; close/lock with scoped authz.  
8. Join request: leader approves managed resource; unmanaged deny; self-approve denied; broad-review admin can approve.  
9. Privacy: member A cannot open B’s private/admin data; no document upload in member portal.  
10. Admin directory search by Church ID / name / phone → in-scope hits only.  
11. Missing-permission deny; second admin still works; cross-church URL/ID isolated.

**EXPECTED_RESULT**  
Each step passes V2.04 Members MUST behavior; dual-role and scoped review work on hosted mount.

**PASS_CRITERIA**  
All 11 steps PASS; FEATURE note lists per-step result + tip SHA.

**FAIL_CRITERIA**  
Any MUST step fails; dual-role destinations missing; scoped leader acts outside managed resources.

**EVIDENCE_TO_CAPTURE**  
Dated FEATURE_QA note + tip SHA; screenshots/clips for fails; Church IDs used (redact phones).

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## RB-QA-02 — Website lifecycle hosted (AC + BB)

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-02 |
| **PRODUCT** | PLATFORM |
| **PURPOSE** | Prove draft → preview → publish → unpublish → version → restore on both products |
| **PRECONDITIONS** | Identity-bound tip (`54cdb1f76f5a` or later); one AC clinic + one BB church with website.edit / publish |
| **TEST_ACCOUNT_ROLE** | AC clinic admin with website publish; BB HQ/branch admin with website publish |
| **START_URL** | AC: `https://activeclinic.neuniversity.org` (Edit Website) · BB: `https://blessboard.neuniversity.org` (HQ/branch website editor) |

**STEPS**

1. **AC:** Edit Website → save draft → preview → publish → confirm public shows published content.  
2. Unpublish / take offline → public no longer shows prior live as published.  
3. Publish again → version history → restore prior version → confirm preview/public per restore rules.  
4. Repeat 1–3 on **BB** website editor.  
5. Optional: media replace survives draft→publish (no string-only payload loss).

**EXPECTED_RESULT**  
AC and BB complete full lifecycle without silent failure; public matches published; drafts stay off public until publish.

**PASS_CRITERIA**  
Lifecycle verbs succeed on **both** AC and BB; public state correct after publish and unpublish.

**FAIL_CRITERIA**  
Publish misses public; unpublish leaves stale public; restore fails/corrupts on either product.

**EVIDENCE_TO_CAPTURE**  
Lifecycle QA note + tip SHA (AC and BB); before/after public URLs; restored version IDs.

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## RB-QA-03 — ActiveClinic hub + editor smoke

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-03 |
| **PRODUCT** | AC |
| **PURPOSE** | Hub is management-only; Edit Website opens real editor; draft/publish smoke works |
| **PRECONDITIONS** | Identity-bound tip; clinic admin with website management access |
| **TEST_ACCOUNT_ROLE** | ActiveClinic clinic / org admin with website management |
| **START_URL** | `https://activeclinic.neuniversity.org` → Clinic Website Management Hub |

**STEPS**

1. Open Clinic Website Management Hub (H01–H06).  
2. Confirm management-only: no fake public canvas as the live editor.  
3. Click **Edit Website** → land in real editor.  
4. Change a visible field → save draft → preview → publish smoke.  
5. Confirm FUTURE/informational hub controls are not shown as active MUST capabilities.

**EXPECTED_RESULT**  
Hub management-only; Edit Website opens editor; draft/publish smoke succeeds; FUTURE stays non-false-active.

**PASS_CRITERIA**  
Steps 1–5 PASS; editor URL reachable; smoke publish updates as expected.

**FAIL_CRITERIA**  
Fake canvas is primary edit surface; Edit Website dead-ends; draft/publish smoke fails.

**EVIDENCE_TO_CAPTURE**  
Hub screenshot; editor URL after Edit Website; draft/publish note + tip SHA.

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## RB-QA-04 — Geography + concurrency hosted

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-04 |
| **PRODUCT** | PLATFORM |
| **PURPOSE** | Disabled-country registration reject + true stale repeat-edit on AC and BB |
| **PRECONDITIONS** | Identity-bound tip; registration with country catalogue; AC + BB editors with concurrent-edit support |
| **TEST_ACCOUNT_ROLE** | Unauthenticated registrant (geo); two browser sessions as website editors (AC then BB) |
| **START_URL** | Registration on hub/product flows · editors: AC + BB website edit URLs above |

**STEPS**

1. Registration: submit disabled country (QA-03 class / direct POST if UI blocks) → expect reject.  
2. Allowed country: city suggestions remain country-aware (smoke).  
3. **AC concurrency:** same field in two sessions; save A; save stale B → true stale rejection (no silent overwrite).  
4. Repeat concurrency on **BB** website editor.

**EXPECTED_RESULT**  
Disabled-country rejected clearly; cities respect country; stale second save rejected on AC **and** BB.

**PASS_CRITERIA**  
Geo reject + both products show conflict/stale on second save.

**FAIL_CRITERIA**  
Disabled country accepted; stale save overwrites; only one product handles stale.

**EVIDENCE_TO_CAPTURE**  
Geo + concurrency note + tip SHA; disabled-country response/status; stale conflict screenshots (AC + BB).

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## RB-QA-05 — Public PHI / field allowlist spot-check

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-05 |
| **PRODUCT** | AC |
| **PURPOSE** | Public doctor/services pages match PD-V204-AC-P1-02 allowlist only |
| **PRECONDITIONS** | Tip preferred identity-bound; clinic with ≥1 public doctor + ≥1 public service published; allowlist policy frozen |
| **TEST_ACCOUNT_ROLE** | Unauthenticated public visitor (no staff login required) |
| **START_URL** | Public doctors + services URLs on `https://activeclinic.neuniversity.org` (clinic public site) |

**STEPS**

1. Open public doctors list + one doctor profile.  
2. Open public services list + one service detail.  
3. Confirm only public-safe fields (display name, title/role, specialty/department, approved photo/bio, org-approved public contact/location as applicable).  
4. Confirm **absence** of private staff email/phone, secret-like internal IDs, auth identifiers, clinical notes, patient/PHI, editHref/admin links.  
5. Optional: booking chrome (R08) hands off to existing book URL without clinical/patient data.

**EXPECTED_RESULT**  
Public pages match allowlist; no prohibited private/PHI fields.

**PASS_CRITERIA**  
Steps 3–4 clean on doctor and services surfaces; optional R08 handoff clean.

**FAIL_CRITERIA**  
Any private contact, clinical/patient data, or non-allowlisted internal field in public HTML.

**EVIDENCE_TO_CAPTURE**  
PHI spot-check note vs PD-V204-AC-P1-02; public URLs + redacted screenshots/HTML snippets.

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## Current status (do not invent)

| QA_ID | Status |
|-------|--------|
| RB-QA-01 | NOT_RUN |
| RB-QA-02 | NOT_RUN |
| RB-QA-03 | NOT_RUN |
| RB-QA-04 | NOT_RUN |
| RB-QA-05 | NOT_RUN |

Source: `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md` (2026-10-02).

---

```
QA_SCENARIOS=5
CURRENT_PASS=0
CURRENT_FAIL=0
CURRENT_BLOCKED=0
CURRENT_NOT_RUN=5
FINAL=V2_04_MANUAL_QA_HANDOFF_READY
```
