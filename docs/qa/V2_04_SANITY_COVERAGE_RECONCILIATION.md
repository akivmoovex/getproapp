# V2.04 Sanity Coverage Reconciliation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_SANITY_COVERAGE_RECONCILIATION` |
| **VERSION** | **2.04** |
| **Mode** | **READ-ONLY** (no application-code changes) |
| **Sanity report** | `ActiveClinic_BlessBoard_V2.04_Sanity_Test_Report` (WhatsApp copy.docx; tester sign-off **30/09/2026**) |
| **Compared against** | `V2_04_FEATURE_INVENTORY_AUDIT.md`, `V2_04_FEATURE_TEST_COVERAGE_AUDIT.md`, `V2_04_SPEC_IMPLEMENTATION_GAP_AUDIT.md`, `V2_04_SPEC_COMPLETENESS_GAP_AUDIT.md` |
| **Inventory HEAD (repo at audit)** | `2f7f44db53bc82baf8b749d207902e4b8b9ecde4` on branch **`V4`** |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_SANITY_COVERAGE_RECONCILED`** |

---

## 0. Verdict (what the sanity test proves / does not prove)

### Proves (within sanity depth)

The V2.04 sanity report **PASS** is valid for the **ten named smoke areas** it executed on **both** ActiveClinic and BlessBoard on **`neuniversity.org`**:

1. Unified login mechanism  
2. Unified registration mechanism  
3. Country autocomplete  
4. City autocomplete  
5. Website editing / studio  
6. Save and preview changes  
7. Public website / main pages  
8. Navigation and main links  
9. Basic image editing  
10. General bug / regression check  

**Do not invalidate those area PASSes.** Classify them as **`SANITY_PASS`**, not as full feature-QA certification.

### Does **not** prove

- BlessBoard **Member** product contract (FR-01..FR-20 / AC-01..AC-25 / BR-* / 45-screen pack).  
- ActiveClinic **Patient** foundation or any clinical patient FR pack.  
- Full website **lifecycle** (publish / unpublish / version / restore / true-stale concurrency).  
- Theme token integrity, Platform Admin website console, Person/duplicate/approval foundations.  
- Spec-implementation gaps already recorded (dual-role UX, join `resolveManagedResourceIds`, email recovery fallback, cells).  
- Spec-completeness blockers (Church ID uniqueness wording, status matrices, missing AC canonical spec).  
- **Build / deploy identity** of the tested host (see §6).

**`FEATURE_QA_PASS` is not claimed by this sanity report for any inventory FEATURE_ID.** Automated coverage / gates remain separate evidence (prior audits).

---

## 1. Sanity report — area roll-up (preserved)

| No. | Test area | AC | BB | Overall | Reconciliation class |
|----:|-----------|:--:|:--:|:-------:|----------------------|
| 1 | Unified Login Mechanism | PASS | PASS | PASS | **`SANITY_PASS`** |
| 2 | Unified Registration Mechanism | PASS | PASS | PASS | **`SANITY_PASS`** |
| 3 | Country Autocomplete | PASS | PASS | PASS | **`SANITY_PASS`** |
| 4 | City Autocomplete | PASS | PASS | PASS | **`SANITY_PASS`** |
| 5 | Website Editing / Studio | PASS | PASS | PASS | **`SANITY_PASS`** |
| 6 | Save and Preview Changes | PASS | PASS | PASS | **`SANITY_PASS`** |
| 7 | Public Website / Main Pages | PASS | PASS | PASS | **`SANITY_PASS`** |
| 8 | Navigation and Main Links | PASS | PASS | PASS | **`SANITY_PASS`** |
| 9 | Basic Image Editing | PASS | PASS | PASS | **`SANITY_PASS`** |
| 10 | General Bug / Regression Check | PASS | PASS | PASS | **`SANITY_PASS`** |

| Meta | Value |
|------|--------|
| Environment cited | `neuniversity.org` |
| Overall product lines | ActiveClinic **PASS** · BlessBoard **PASS** · Version 2.04 Sanity **PASSED** |
| Tester | Christine Manjombi · **30/09/2026** · Decision **PASSED** |
| Depth | Smoke / major-path only — no AC-01..25 matrix, no QA01–QA21 pack, no negative RBAC/isolation cases |

**`SANITY_AREAS_PASS=10`**

---

## 2. Exclusion statement vs canonical / implemented release scope

### What the sanity report states (§4)

> BlessBoard Members feature, ActiveClinic Patients feature, and other new major features awaiting requirements were **not included** because they are **not part of this release** and are **awaiting requirements**.

### What the four audits + canonical sources say

| Claim in sanity report | Inventory / gates / specs | Consistency |
|------------------------|---------------------------|-------------|
| BB Members **not part of V2.04 release** | Canonical Member Feature Spec FR-01..FR-20 = **MUST / NEW**; inventory §3.1 (**21** BB features including BB-WEBSITE-ENGINE); final gate + manual QA handoff (QA01–QA21) treat members as **in-scope V2.04** | **INCONSISTENT** — Members **are** V2.04 release scope. Excluding them from *this sanity session* is a test-scope choice; calling them out-of-release is **incorrect**. |
| AC Patients **not part of V2.04 / awaiting requirements** | Inventory **`AC-PATIENT-DOMAIN`** = **FOUNDATION** (staff Add Patient domain over ACN10/11); automated `v2-04-ac-patient-domain` in final gate; **no** AC Canonical Feature Spec (`SPEC_NOT_FOUND` / completeness **BLOCKING**) | **PARTIALLY INCONSISTENT** — Full patient Stitch UI is **not** claimed as V2.04 MUST UI; **domain foundation is in implemented V2.04 scope**. “Awaiting requirements” fits missing **AC FR/AC pack**, not “feature absent from release.” |
| “Other new major features awaiting requirements” | Shared theme, geography, website platformization **are** in release notes and were the bulk of what sanity **did** test | Vague — OK as catch-all for deferred Decision Register items (§7 inventory); **must not** erase BB Members |

### Correct framing

| Item | In V2.04 product/release scope? | In this sanity run? | Classification for reconciliation |
|------|--------------------------------:|--------------------:|-----------------------------------|
| BB Members (FR-01..20) | **YES** (canonical MUST) | **NO** (explicitly excluded) | **`NOT_SANITY_TESTED`** + **`REQUIRES_MANUAL_QA`** — **not** `OUT_OF_SCOPE` |
| AC Patient domain foundation | **YES** (FOUNDATION) | **NO** (excluded) | **`NOT_SANITY_TESTED`** + **`REQUIRES_MANUAL_QA`** (foundation/staff path) — **not** `OUT_OF_SCOPE` |
| Inventory §7 DEFER rows (Visitor journey, merge, staff-scan QR, AC polish FUTURE, etc.) | **NO** (deferred) | N/A | **`OUT_OF_SCOPE`** |

**Conclusion:** The sanity report’s *decision to skip* Members/Patients for that run is factual. Its *rationale* (“not part of this release”) **contradicts** the canonical BB contract and the inventory’s implemented release scope. Do **not** treat Members/Patients as `OUT_OF_SCOPE` when mapping V2.04 features.

---

## 3. Sanity area → inventory feature bridge

| Sanity area | Closest inventory FEATURE_ID(s) | What sanity actually exercised | Still unproven |
|-------------|---------------------------------|--------------------------------|----------------|
| Unified login | *(no dedicated FEATURE_ID; inherited platform login + product routing)* | Staff/org login loads; credentials work; correct product destination | BB **member** Church ID + password (FR-05); dual-role destinations (FR-12); rate limits / enumeration (auth suites) |
| Unified registration | **PLAT-REG-GEOGRAPHY** (+ inherited org registration) | Registration screens; AC city path continued after select | Disabled-country POST rejection (**PLAT-COUNTRY-AVAIL** edge); full geo catalogue integrity |
| Country autocomplete | **PLAT-REG-GEOGRAPHY**, **PLAT-COUNTRY-AVAIL** (partial) | Search / suggest / select | Availability enforcement negatives |
| City autocomplete | **PLAT-CITY-CATALOGUE**, **PLAT-REG-GEOGRAPHY** | Suggest / select on AC (report); table marks BB PASS too | Country-aware catalogue edges; empty/disabled country |
| Website editing / studio | **PLAT-EDITOR-ENGINE**, **AC-MW-EDITOR**, **BB-WEBSITE-ENGINE** (partial) | Studio opens; tools load; content editable | Hub H01–H06 (**AC-MW-HUB**); Platform Admin console |
| Save / preview | **PLAT-WEB-LIFECYCLE** (partial), product editors | Save + preview updated content | Publish / unpublish / version / restore / true-stale (**PLAT-MW-CONCURRENCY**) |
| Public pages + navigation | **AC-MW-PUBLIC**, **PLAT-WEB-PRESENTATION** / **COMPONENTS** (partial), BB public site | Pages load; nav works; updated content visible | Full R01–R12 Stitch criteria (SPEC_GAP); authz/PHI public policy |
| Basic image editing | **PLAT-MEDIA-UPLOAD** (partial) | Basic image edit path | Hardened media contracts / singular-engine negatives |
| General regression | — | No blocking issues observed on main workflows touched | Theme tokens, foundations, member/patient domains, known HIGH impl gaps |

---

## 4. Feature map — every inventory V2.04 FEATURE_ID

Legend:

| Class | Meaning |
|-------|---------|
| **SANITY_TESTED** | Named sanity area(s) clearly exercised this feature’s primary happy path |
| **PARTIALLY_SANITY_TESTED** | Related smoke touched a subset only |
| **NOT_SANITY_TESTED** | In V2.04 inventory scope; not covered by the sanity report |
| **OUT_OF_SCOPE** | Inventory §7 DEFERRED / non-goals — not expected in this sanity |

Secondary QA labels (orthogonal to sanity class):

| Label | Meaning |
|-------|---------|
| **SANITY_PASS** | Area PASS in report (smoke only) |
| **FEATURE_QA_PASS** | **Not awarded** from this sanity report |
| **NOT_TESTED** | No sanity evidence for this feature |
| **REQUIRES_MANUAL_QA** | Still needs human FEATURE QA (and/or scenario pack) before release feature certification |

### 4.1 BlessBoard (§3.1 inventory) — 21

| FEATURE_ID | Sanity class | Sanity evidence | Secondary label |
|------------|--------------|-----------------|-----------------|
| FR-01 Membership creation | **NOT_SANITY_TESTED** | Explicitly excluded (Members) | **REQUIRES_MANUAL_QA** (QA01/QA02) · **NOT_TESTED** |
| FR-02 Church ID | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-03 First activation | **NOT_SANITY_TESTED** | Excluded (≠ unified org login) | **REQUIRES_MANUAL_QA** (QA03) · **NOT_TESTED** |
| FR-04 Password policy | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-05 Returning member login | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA04) · **NOT_TESTED** |
| FR-06 Password recovery | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA05) · **NOT_TESTED** |
| FR-07 Lost Church ID | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-08 Member homepage | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-09 Profile | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA06–07) · **NOT_TESTED** |
| FR-10 Blocking | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-11 Multiple admins | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA18) · **NOT_TESTED** |
| FR-12 Dual experience | **NOT_SANITY_TESTED** | Excluded; also IMPL PARTIAL | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-13 Manual attendance | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA11–12) · **NOT_TESTED** |
| FR-14 QR attendance | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA13–16) · **NOT_TESTED** |
| FR-15 Requests | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA08) · **NOT_TESTED** |
| FR-16 Approvals | **NOT_SANITY_TESTED** | Excluded; IMPL PARTIAL (injector) | **REQUIRES_MANUAL_QA** (QA09–10) · **NOT_TESTED** |
| FR-17 Privacy | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-18 Documents restriction | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| FR-19 Audit | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** (QA17) · **NOT_TESTED** |
| FR-20 Admin search | **NOT_SANITY_TESTED** | Excluded | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| BB-WEBSITE-ENGINE | **PARTIALLY_SANITY_TESTED** | BB rows PASS for studio / save / preview / public / nav / image | **REQUIRES_MANUAL_QA** for full lifecycle cutover · not **FEATURE_QA_PASS** |

### 4.2 ActiveClinic (§4 inventory) — 5

| FEATURE_ID | Sanity class | Sanity evidence | Secondary label |
|------------|--------------|-----------------|-----------------|
| AC-MW-PUBLIC | **SANITY_TESTED** | Public pages + navigation PASS | Area **SANITY_PASS**; not full Stitch AC criteria (**SPEC_GAP**) → still **REQUIRES_MANUAL_QA** for visual/product criteria pack if product requires it |
| AC-MW-EDITOR | **SANITY_TESTED** | Studio / editing / save / preview / image PASS | **SANITY_PASS**; polish E01/E02 still deferred |
| AC-MW-HUB | **NOT_SANITY_TESTED** | Report names Studio/editor, not H01–H06 hub controls | **REQUIRES_MANUAL_QA** / **NOT_TESTED** |
| AC-WEBSITE-ADAPTER | **PARTIALLY_SANITY_TESTED** | Public + editor behavior exercised indirectly | **REQUIRES_MANUAL_QA** for adapter edge cases |
| AC-PATIENT-DOMAIN | **NOT_SANITY_TESTED** | Explicitly excluded; **in** release as FOUNDATION | **REQUIRES_MANUAL_QA** · **NOT_TESTED** — **not** `OUT_OF_SCOPE` |

### 4.3 Shared platform (§5 inventory) — 17

| FEATURE_ID | Sanity class | Sanity evidence | Secondary label |
|------------|--------------|-----------------|-----------------|
| PLAT-REG-GEOGRAPHY | **SANITY_TESTED** | Registration + country/city autocomplete PASS | **SANITY_PASS** |
| PLAT-CITY-CATALOGUE | **PARTIALLY_SANITY_TESTED** | City autocomplete happy path | **REQUIRES_MANUAL_QA** / deeper QA-02 edges |
| PLAT-COUNTRY-AVAIL | **PARTIALLY_SANITY_TESTED** | Country select works | Disabled-country reject **NOT_TESTED** in sanity |
| PLAT-EDITOR-ENGINE | **SANITY_TESTED** | Studio / edit tools PASS both products | **SANITY_PASS** |
| PLAT-WEB-LIFECYCLE | **PARTIALLY_SANITY_TESTED** | Save + preview only | Publish/version/restore **NOT_TESTED** here |
| PLAT-MEDIA-UPLOAD | **PARTIALLY_SANITY_TESTED** | Basic image editing PASS | Hardening edges **NOT_TESTED** |
| PLAT-WEB-PRESENTATION | **PARTIALLY_SANITY_TESTED** | Public pages load | Full model **NOT_TESTED** |
| PLAT-WEB-COMPONENTS | **PARTIALLY_SANITY_TESTED** | Via public/editor smoke | Component matrix **NOT_TESTED** |
| PLAT-COLOR-THEME | **NOT_SANITY_TESTED** | Not named; general regression ≠ theme gate | **REQUIRES_MANUAL_QA** / hosted theme checks separate |
| PLAT-ADMIN-WEB-CONSOLE | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-PERSON | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-DUP-ENGINE | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-STAFF-PERSON-WF | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-APPROVAL-REQ | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-MW-CONCURRENCY | **NOT_SANITY_TESTED** | — | **REQUIRES_MANUAL_QA** · **NOT_TESTED** |
| PLAT-ASSET-VERSION | **NOT_SANITY_TESTED** | — | **NOT_TESTED** (hosted freeze had separate evidence) |
| PLAT-VERSION-2.04 | **NOT_SANITY_TESTED** | Version “2.04” in title only; About page not cited | **NOT_TESTED** in sanity body |

### 4.4 Deferred inventory (§7) — 13 → `OUT_OF_SCOPE`

| FEATURE_ID | Sanity class |
|------------|--------------|
| DR-15, DR-35, DR-50, DR-48, BB-NONGOAL-NOTIFY, BB-NONGOAL-XFER-UX, DR-28-UX, AC-E01-E02-POLISH, AC-H03-H06-FUTURE, AC-STITCH-MED-GAPS, ACN18-BINARIES, ACP05-PDF, ACN27-OCCUPANCY | **OUT_OF_SCOPE** |

---

## 5. Cross-audit implications (do not collapse evidence types)

| Prior audit finding | Effect on sanity PASS |
|---------------------|------------------------|
| Test coverage: AC-23/24/13 etc. gaps | Irrelevant to invalidating studio/geo **SANITY_PASS**; still **REQUIRES_MANUAL_QA** / automation for Members |
| Spec↔impl: FR-12 dual-role HIGH; join injector HIGH | **Not** exercised by sanity; remains open for FEATURE QA |
| Spec completeness: AC canonical **BLOCKING**; Church ID uniqueness ambiguity | Sanity cannot close product-contract gaps |
| Freeze handoff hosted geography/lifecycle PASS (`c16c791f…`) | **Separate** evidence stream from this Word sanity report; do not merge into sanity identity |

**Rule used:** Sanity PASS stands for areas tested. Inventory MUST features excluded from the run remain **`NOT_SANITY_TESTED`**, not failed, and not out of release.

---

## 6. Build / release identity evidence (missing from sanity report)

| Identity field | Present in sanity report? | Notes |
|----------------|--------------------------:|-------|
| Branch | **NO** | Repo audits use **`V4`**; report silent |
| Full application SHA | **NO** | Freeze candidate historically `c16c791f9a4d…`; BB member gate `b8e9f4a1…`; inventory HEAD `2f7f44db…` — **none** cited in sanity doc |
| Deployment / hosted SHA | **NO** | Freeze handoff had `HOSTED_REPOSITORY_SHA=569712ad…`; sanity cites only `neuniversity.org` |
| DB identity | **NO** | No DB name / slot / backup id |
| Migration ceiling | **NO** | No platform `044`–`047` or BB `119`–`122` ceiling recorded |

**`BUILD_IDENTITY_CONFIRMED=NO`**

Without those fields, the sanity PASSes remain valid as **tester observations on an unnamed deploy of “2.04” on neuniversity.org**, but they **cannot** be bound to a specific application candidate SHA or migration ceiling for release attestation.

---

## 7. Count methodology

**Population for feature counts:** Inventory FEATURE_IDs with STATUS ∈ {NEW, CHANGED, FOUNDATION} = **43** (BB 21 + AC 5 + SHARED 17).  
Deferred §7 rows counted only under `OUT_OF_SCOPE` (not in SANITY_TESTED / PARTIAL / NOT_TESTED totals).

| Sanity class | Count | IDs |
|--------------|------:|-----|
| **SANITY_TESTED** | **4** | AC-MW-PUBLIC, AC-MW-EDITOR, PLAT-REG-GEOGRAPHY, PLAT-EDITOR-ENGINE |
| **PARTIALLY_SANITY_TESTED** | **8** | BB-WEBSITE-ENGINE, AC-WEBSITE-ADAPTER, PLAT-CITY-CATALOGUE, PLAT-COUNTRY-AVAIL, PLAT-WEB-LIFECYCLE, PLAT-MEDIA-UPLOAD, PLAT-WEB-PRESENTATION, PLAT-WEB-COMPONENTS |
| **NOT_SANITY_TESTED** | **31** | FR-01..FR-20 (20), AC-MW-HUB, AC-PATIENT-DOMAIN, PLAT-COLOR-THEME, PLAT-ADMIN-WEB-CONSOLE, PLAT-PERSON, PLAT-DUP-ENGINE, PLAT-STAFF-PERSON-WF, PLAT-APPROVAL-REQ, PLAT-MW-CONCURRENCY, PLAT-ASSET-VERSION, PLAT-VERSION-2.04 |
| **OUT_OF_SCOPE** (deferred) | **13** | Inventory §7 |

**`REQUIRES_MANUAL_QA`:** Inventory in-scope features that this sanity report does **not** fully certify (`PARTIALLY_SANITY_TESTED` + `NOT_SANITY_TESTED`) = **8 + 31 = 39**.  
(Even the 4 `SANITY_TESTED` rows are smoke-only; AC public/editor additionally inherit **SPEC_GAP** for criteria-level Feature QA if product requires an AC AC-pack.)

**`FEATURE_QA_PASS` from this report:** **0** inventory features.

**`SANITY_AREAS_PASS`:** **10** (all named table areas).

---

## 8. Caveats

1. Sanity source file recovered from WhatsApp temp storage (`…Sanity_Test_Report copy.docx`); content tables match the signed report structure (Christine Manjombi, 30/09/2026).  
2. “Unified login/registration” ≠ BlessBoard member portal authentication.  
3. Same calendar date as website/geography freeze handoff; member candidate SHAs differ — identity gap in §6 is material.  
4. This document does not re-score automated tests or re-open area PASSes.

---

SANITY_AREAS_PASS=10
V204_FEATURES_SANITY_TESTED=4
V204_FEATURES_PARTIAL=8
V204_FEATURES_NOT_TESTED=31
REQUIRES_MANUAL_QA=39
BUILD_IDENTITY_CONFIRMED=NO
FINAL=V2_04_SANITY_COVERAGE_RECONCILED
