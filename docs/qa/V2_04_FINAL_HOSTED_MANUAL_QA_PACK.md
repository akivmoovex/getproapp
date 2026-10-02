# V2.04 Final Hosted Manual QA Pack

**Mode:** READ-ONLY pack for testers (no code · no Cursor deploy).  
**Date:** 2026-10-02  
**Canonical path:** `docs/qa/V2_04_FINAL_HOSTED_MANUAL_QA_PACK.md`  
**Sources:** `docs/qa/V2_04_FINAL_MANUAL_QA_HANDOFF.md`, `docs/qa/V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md`  
**Also:** `docs/qa/V2_04_AC_SERVICES_DOCTORS_CONTACT_AUDIT.md` (RB-QA-03 manage / R07 / pricing scope)

### Bound candidate (live probe 2026-10-02)

| Field | Value |
|-------|--------|
| VERSION | 2.04 |
| BRANCH | V4 |
| BB_SHA | `554d37406ef5` (live hosted tip at probe) |
| AC_SHA | `554d37406ef5` (live hosted tip at probe) |
| APPLICATION_CANDIDATE_SHA | `33e5c29612942e1484086432214b733f353f8601` (C01/C02/E03 frozen; **not yet deployed**) |
| PREVIOUS_HOSTED_SHA | `554d37406ef5` |
| ENVIRONMENT | testing |
| DEPLOYMENT_CODE | moovex-platform-v8-testing |
| BB HOST | `https://blessboard.neuniversity.org` |
| AC HOST | `https://activeclinic.neuniversity.org` |
| HUB | `https://neuniversity.org` |

**Binding rule:** After Hostinger testing deploy of `33e5c296…`, bind FEATURE evidence to that tip (About + `/healthz`). Until then, live tip remains `554d37406ef5` (C01/C02 not renderable). Prefer `BRANCH=V4` / `V4 testing` (RB-ID-01). Do **not** treat production hosts as release evidence.  
**Do not mark PASS without tester evidence.** Leave result blocks blank until filled by a tester.

### Shared before you start

1. Confirm About **Version 2.04** and Build SHA matches **BB_SHA / AC_SHA** above (or documented later tip).  
2. Prefer `/healthz`: `environment=testing`, `deploymentCode=moovex-platform-v8-testing`, `branch=V4`, `displayLabel=V4 testing`.  
3. Use TESTING only.  
4. Fill blank result fields under each scenario when done; attach evidence paths/URLs.

---

## RB-QA-01 — BB Members FEATURE QA

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-01 |
| **PRODUCT** | BB |
| **PURPOSE** | End-to-end Members MUST pack (create / auth / recovery / block / dual-role / attendance / scoped review / privacy / search / isolation) |
| **PRECONDITIONS** | Identity-bound TESTING tip (`554d37406ef5`, BRANCH=V4 preferred); one church with staff admin + ordinary member + dual-role (member + HQ/branch admin); second church for isolation |
| **START_URL** | `https://blessboard.neuniversity.org` → HQ / member portal as role requires |
| **ROLE** | (1) Church staff admin (2) Ordinary member (3) Dual-role member+admin (4) Optional second-church admin |

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

**EXPECTED**  
Each step passes V2.04 Members MUST behavior; dual-role and scoped review work on hosted mount.

**PASS_CRITERIA**  
All 11 steps PASS; FEATURE note lists per-step result + bound SHA `554d37406ef5` (or later tip).

**FAIL_CRITERIA**  
Any MUST step fails; dual-role destinations missing; scoped leader acts outside managed resources.

**EVIDENCE_REQUIRED**  
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

## RB-QA-02 — Shared website lifecycle

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-02 |
| **PRODUCT** | SHARED (AC + BB) |
| **PURPOSE** | Prove draft → publish → unpublish → version → restore → true-stale conflict on both products |
| **PRECONDITIONS** | Identity-bound tip (`554d37406ef5`, BRANCH=V4 preferred); one AC clinic + one BB church with website.edit / publish; two editor sessions available for stale conflict |
| **START_URL** | AC: `https://activeclinic.neuniversity.org` (Edit Website) · BB: `https://blessboard.neuniversity.org` (HQ/branch website editor) |
| **ROLE** | AC clinic admin with website publish; BB HQ/branch admin with website publish |

**STEPS**

1. **Draft (AC):** Edit Website → change a visible field → save draft → preview draft (public must not show draft-only content).  
2. **Publish (AC):** publish → confirm public shows published content.  
3. **Unpublish (AC):** unpublish / take offline → public no longer shows prior live as published.  
4. **Version (AC):** publish again → open version history → note version IDs.  
5. **Restore (AC):** restore a prior version → confirm preview/public per restore rules.  
6. **True-stale conflict (AC):** two sessions edit the same field; save A; save stale B → expect true stale / conflict rejection (no silent overwrite).  
7. Repeat steps 1–6 on **BB** website editor (draft / publish / unpublish / version / restore / true-stale).  
8. Optional: media replace survives draft→publish (no string-only payload loss).

**EXPECTED**  
AC and BB complete full lifecycle without silent failure; public matches published; drafts stay off public until publish; stale second save is rejected on both products.

**PASS_CRITERIA**  
Lifecycle verbs (draft, publish, unpublish, version, restore) succeed on **both** AC and BB; true-stale conflict proven on **both**; public state correct after publish and unpublish.

**FAIL_CRITERIA**  
Publish misses public; unpublish leaves stale public; restore fails/corrupts; stale save overwrites on either product; lifecycle only proven on one product.

**EVIDENCE_REQUIRED**  
Lifecycle QA note + tip SHA (AC and BB); before/after public URLs; restored version IDs; stale-conflict screenshots (AC + BB).

```
RESULT=
TESTER=
DATE=
EVIDENCE=
DEFECT_ID=
NOTES=
```

---

## RB-QA-03 — AC Website Hub + Edit Website hosted smoke

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-03 |
| **PRODUCT** | AC |
| **PURPOSE** | Hub management-only; Edit Website opens real editor; draft/publish smoke; Services/Doctors Manage; Contact R07; Pricing edit-mode links |
| **PRECONDITIONS** | Identity-bound tip (`554d37406ef5`, BRANCH=V4 preferred); clinic admin with website management; clinic with public services/doctors/contact/pricing routes; post public-site management fix pack preferred |
| **START_URL** | `https://activeclinic.neuniversity.org` → Clinic Website Management Hub |
| **ROLE** | ActiveClinic clinic / org admin with website management |

**STEPS**

1. Open Clinic Website Management Hub (H01–H06).  
2. Confirm management-only: no fake public canvas as the live editor.  
3. Click **Edit Website** → land in real editor.  
4. Change a visible field → save draft → preview → publish smoke.  
5. Confirm FUTURE/informational hub controls are not shown as active MUST capabilities.  
6. **Services Manage:** from public services page in edit mode (`/clinics/:clinicKey/services?website_edit=1&website_mode=draft`) open **Manage** → land on operational catalogue (`/app/settings/website/catalogue?tab=services` or working `/catalogue/services` alias) — **not** a blank screen.  
7. **Doctors Manage:** from public doctors page in edit mode open **Manage** → land on operational catalogue (`?tab=doctors` or working `/catalogue/doctors` alias) — **not** blank.  
8. **Contact R07:** open `/clinics/:clinicKey/contact` (edit and/or public as applicable) → confirm R07 chrome (urgent/legal/form heading hierarchy); inquiry form usable; no second contact domain.  
9. **Pricing edit-mode links:** open `/clinics/:clinicKey/pricing?website_edit=1&website_mode=draft` → click Contact / View services CTAs → destination URLs **retain** `website_edit=1&website_mode=draft` (do not drop into live public without edit params).

**EXPECTED**  
Hub management-only; Edit Website opens editor; draft/publish smoke succeeds; Manage CTAs open catalogue (not blank); Contact meets R07 parity; pricing CTAs preserve edit-mode query.

**PASS_CRITERIA**  
Steps 1–9 PASS; editor URL reachable; Manage paths non-blank; pricing edit links keep edit query; smoke publish updates as expected.

**FAIL_CRITERIA**  
Fake canvas is primary edit surface; Edit Website dead-ends; Manage blank; Contact missing R07 must-have chrome; pricing CTAs strip edit-mode params; draft/publish smoke fails.

**EVIDENCE_REQUIRED**  
Hub screenshot; editor URL after Edit Website; Manage destination URLs (services + doctors); Contact R07 screenshot; pricing CTA hrefs with edit query preserved; draft/publish note + tip SHA.

```
RESULT=FAIL
TESTER=Cursor hosted probe (read-only)
DATE=2026-10-02
EVIDENCE=https://activeclinic.neuniversity.org/app/settings/website/catalogue?tab=services → HTTP 303 Location=/login (x-ac-auth-decision=redirect_login; no session). Same for ?tab=doctors. Hosted /healthz gitSha=554d37406ef5. Hosted /activeclinic/website-cms.css has hub H0x stitch rules only — no AC-MW-C01/C02 catalogue block (that CSS + catalogue.ejs stitch markers are local dirty / undeployed). Cannot render C01/C02 desktop table/mobile cards/sticky bar or E03 against Stitch IDs without (1) deploy of C01/C02 tip and (2) authenticated website.edit session.
DEFECT_ID=
NOTES=Not a new product defect ID — verification blocked: tip not deployed + auth wall. Hosted visual PASS impossible this probe. Re-run after Hostinger deploy of C01/C02 tip with tester login.
```

---

## RB-QA-04 — Shared disabled-country POST + true-stale concurrency

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-04 |
| **PRODUCT** | SHARED (AC + BB) |
| **PURPOSE** | Disabled-country registration reject + true stale repeat-edit concurrency on AC and BB |
| **PRECONDITIONS** | Identity-bound tip (`554d37406ef5`, BRANCH=V4 preferred); registration with country catalogue; AC + BB editors with concurrent-edit support; two browser sessions |
| **START_URL** | Registration on hub/product flows · editors: AC + BB website edit URLs (`https://activeclinic.neuniversity.org`, `https://blessboard.neuniversity.org`) |
| **ROLE** | Unauthenticated registrant (geo); two browser sessions as website editors (AC then BB) |

**STEPS**

1. **Disabled-country POST:** registration submit with a disabled country (QA-03-class / direct POST if UI blocks selection) → expect clear reject (not silent accept).  
2. Allowed country: city suggestions remain country-aware (smoke).  
3. **AC true-stale concurrency:** same field in two sessions; save A; save stale B → true stale rejection (no silent overwrite).  
4. **BB true-stale concurrency:** repeat step 3 on BB website editor.

**EXPECTED**  
Disabled-country rejected clearly; cities respect country; stale second save rejected on AC **and** BB.

**PASS_CRITERIA**  
Geo reject proven; both products show conflict/stale on second save; evidence bound to tip SHA.

**FAIL_CRITERIA**  
Disabled country accepted; stale save overwrites; only one product handles stale.

**EVIDENCE_REQUIRED**  
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

## RB-QA-05 — AC public PHI allowlist spot-check (doctors / services)

| Field | Value |
|-------|--------|
| **QA_ID** | RB-QA-05 |
| **PRODUCT** | AC |
| **PURPOSE** | Public doctor/services pages match PD-V204-AC-P1-02 allowlist only |
| **PRECONDITIONS** | Tip preferred identity-bound (`554d37406ef5`, BRANCH=V4 preferred); clinic with ≥1 public doctor + ≥1 public service published; allowlist policy frozen (RB-PROD-07 CLOSED) |
| **START_URL** | Public doctors + services URLs on `https://activeclinic.neuniversity.org` (clinic public site: `/clinics/:clinicKey/doctors`, `/clinics/:clinicKey/services`) |
| **ROLE** | Unauthenticated public visitor (no staff login required) |

**STEPS**

1. Open public doctors list + one doctor profile.  
2. Open public services list + one service detail.  
3. Confirm only public-safe fields (display name, title/role, specialty/department, approved photo/bio, org-approved public contact/location as applicable).  
4. Confirm **absence** of private staff email/phone, secret-like internal IDs, auth identifiers, clinical notes, patient/PHI, editHref/admin links.  
5. Optional: booking chrome (R08) hands off to existing book URL without clinical/patient data.

**EXPECTED**  
Public pages match allowlist; no prohibited private/PHI fields.

**PASS_CRITERIA**  
Steps 3–4 clean on doctor and services surfaces; optional R08 handoff clean.

**FAIL_CRITERIA**  
Any private contact, clinical/patient data, or non-allowlisted internal field in public HTML.

**EVIDENCE_REQUIRED**  
PHI spot-check note vs PD-V204-AC-P1-02; public URLs + redacted screenshots/HTML snippets; tip SHA.

```
RESULT=FAIL
TESTER=Cursor hosted probe (read-only)
DATE=2026-10-02
EVIDENCE=Public PHI spot-check against live public doctors/services HTML not completed: no discoverable published clinic public URLs from AC apex (home has no /clinics/… links; demo keys 404). Catalogue management privacy/E03 path not reachable without auth (same 303→/login as RB-QA-03). Hosted tip SHA=554d37406ef5.
DEFECT_ID=
NOTES=Folded C01/C02 hosted attempt into this pack. No new release blocker minted — failure mode is missing deploy/auth/public clinic sample for probe, not a confirmed PHI leak. Re-run with known published clinicKey + C01 tip.
```

---

## Current status (do not invent)

| QA_ID | Status |
|-------|--------|
| RB-QA-01 | NOT_RUN |
| RB-QA-02 | NOT_RUN |
| RB-QA-03 | FAIL (hosted C01/C02 probe blocked — tip undeployed + auth) |
| RB-QA-04 | NOT_RUN |
| RB-QA-05 | FAIL (hosted public PHI/C01 fold — no public clinic sample + auth) |

### C01/C02 hosted visual probe (2026-10-02, READ-ONLY)

| Check | Result |
|-------|--------|
| Hosted SHA | `554d37406ef5` (AC/BB/hub) |
| C01/C02 code on Hostinger tip | **NO** — frozen locally as `33e5c296…`; not yet deployed |
| `/catalogue?tab=services\|doctors` | **303 → /login** (no session) |
| HOSTED_C01_DESKTOP/MOBILE | **FAIL** (not renderable) |
| HOSTED_C02_DESKTOP/MOBILE | **FAIL** (not renderable) |
| HOSTED_E03 | **FAIL** (not renderable) |
| NEW_DEFECTS | **0** (deploy/auth gap, not product defect ID) |

No tester evidence supplied for this pack. Source posture: `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md` / remaining blockers (2026-10-02).

---

```
QA_SCENARIOS=5
BOUND_BRANCH=V4
BOUND_BB_SHA=554d37406ef5
BOUND_AC_SHA=554d37406ef5
APPLICATION_CANDIDATE_SHA=33e5c29612942e1484086432214b733f353f8601
PREVIOUS_HOSTED_SHA=554d37406ef5
HOSTED_C01_DESKTOP=FAIL
HOSTED_C01_MOBILE=FAIL
HOSTED_C02_DESKTOP=FAIL
HOSTED_C02_MOBILE=FAIL
HOSTED_E03=FAIL
RB_QA_03_EVIDENCE_ADDED=YES
RB_QA_05_EVIDENCE_ADDED=YES
NEW_DEFECTS=0
CURRENT_NOT_RUN=3
CURRENT_FAIL=2
READY_FOR_HOSTED_DEPLOY=YES
FINAL=V2_04_AC_C01_C02_CANDIDATE_FROZEN
```
