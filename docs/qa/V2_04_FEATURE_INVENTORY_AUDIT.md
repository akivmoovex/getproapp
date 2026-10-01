# V2.04 Feature Inventory Audit (Authoritative)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_FEATURE_INVENTORY_AUDIT` |
| **VERSION** | **2.04** |
| **BRANCH** | **V4** |
| **Audit mode** | **READ-ONLY** (no application-code changes) |
| **Inventory HEAD** | `2f7f44db53bc82baf8b749d207902e4b8b9ecde4` |
| **BB member application candidate (gate)** | `b8e9f4a196f381f3be57e8084b3c6905a7bbeb41` |
| **Earlier V2.04 website/theme freeze candidate** | `c16c791f9a4d102aa213debb3f4f0975c258c487` |
| **V2.03 baseline (diff left)** | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` (QA handoff) · later V2.03 notes also cite `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_FEATURE_INVENTORY_COMPLETE`** |

---

## 0. Purpose and rules

Create the authoritative inventory of **NEW / CHANGED / FOUNDATION / DEFERRED** V2.04 functionality for **BlessBoard** and **ActiveClinic** before evaluating tests or implementation gaps.

**Rules followed**

- Sources consulted in priority order (below).
- BlessBoard product/QA contract = **Canonical Member Feature Specification** (FR / AC / BR + decision classes).
- ActiveClinic: no in-repo FR/AC/BR-style V2.04 feature specification found → **`SPEC_NOT_FOUND`**; AC inventory uses release notes + implementation/docs delta only.
- **No invented requirements.**
- `AC-xx` in the BlessBoard canonical spec means **Acceptance Criteria**, not ActiveClinic.

---

## 1. Sources (priority order)

| Pri | Source | Path / identity | Role |
|----:|--------|-----------------|------|
| 1a | **Canonical BB Member Feature Specification** | External: `BlessBoard_V2.04_Canonical_Feature_Specification_FINAL.pdf` (Downloads; 2026-09-30) | **BB product/QA contract** — FR-01..20, AC-01..25, BR-01..11, Decision Register #1..55 with MUST / FOUNDATION / RECOMMENDED / DEFER |
| 1b | BB Member Feature Decision Spec (QA baseline) | External: `BlessBoard_V2.04_Member_Feature_Decision_Specification_QA.pdf` | Decision matrix precursor; aligned with FINAL |
| 1c | In-repo V2.04 architecture / implementation reports | `docs/architecture/V2_04_*.md`, `docs/implementation/V2_04_*.md`, `docs/design/ACTIVECLINIC_V2_04_*.md` | Domain/foundation + AC Stitch map (not FR-style AC product contract) |
| 2 | V2.04 release notes | `docs/releases/V2_04_RELEASE_NOTES.md`, `docs/releases/BLESSBOARD_RELEASE_NOTES.md`, `src/platform/release-notes/releaseNotesCatalog.js` | Platform / website / theme / geography + AC Stitch |
| 2b | BB feature implementation status | External: `BlessBoard_V2.04_Release_Notes_Feature_Implementation_Status.pdf` | FR/AC status vs candidate `b8e9f4a1…` |
| 3 | V2.04 QA handoff / gates | `docs/qa/V2_04_QA_RELEASE_FREEZE_HANDOFF.md`, `docs/qa/V2_04_BB_MANUAL_QA_HANDOFF.md`, `docs/qa/V2_04_BB_FINAL_QA_RELEASE_GATE.md`, `docs/qa/V2_04_BB_MEMBER_FINAL_GATE.md`, `docs/qa/V2_04_QA_TEST_INVENTORY.md`, color/website overnight handoffs | Freeze identity, deferred polish, test inventory |
| 4 | Git history / diff | `b8c18c3d…` → `HEAD` on `V4` (~109 commits; selective name-status on migrations/tests/docs) | Confirms NEW paths vs V2.03 |
| 5 | Existing tests | `tests/v2-04-*.js` (+ architecture suite referenced by gates) | TEST_HINT paths only |

**ActiveClinic V2.04 canonical feature specification:** **`SPEC_NOT_FOUND`** in repo (`docs/**`) and Downloads (no `ActiveClinic*V2.04*Feature*Spec*` / FR-register document). Closest AC V2.04 artifacts: Stitch website implementation map/prompts + patient domain foundation report + shared release notes.

---

## 2. Inventory summary (by product)

| Bucket | What counts as V2.04 | Count basis |
|--------|----------------------|-------------|
| **BB** | Canonical FR-01..FR-20 + BB website engine cutover | See §3 |
| **AC** | Stitch website families + patient domain foundation + presentation adapter | See §4 (`SPEC_NOT_FOUND` for FR contract) |
| **SHARED** | Color/theme, geography, website platformization, person/approval foundations, concurrency/versioning | See §5 |
| **INHERITED (V2.03)** | Unchanged AC clinical Batches 1–3 ops; BB pre-member website continuity baseline | See §6 (not in V2.04 NEW counts) |
| **DEFERRED** | Spec DEFER / non-goals + freeze V2.05 polish | See §7 |

---

## 3. BlessBoard V2.04 features (canonical FR contract)

**Contract source:** Canonical Member Feature Specification (FINAL).  
**Screen inventory (UI packaging):** BB-M01..M27, BB-A01..A14, BB-R01..R04 = **45** (Stitch reconciliation / final gate).  
**Migrations (BB):** `119_member_number_church_id.sql`, `120_member_domain_v204.sql`, `121_attendance_session_domain_v204.sql`, `122_department_join_request_v204.sql`.

### 3.1 Functional requirements (FEATURE records)

| PRODUCT | FEATURE_ID | FEATURE | SOURCE | CLASS | IMPLEMENTATION_HINT/PATH | TEST_HINT/PATH | STATUS |
|---------|------------|---------|--------|-------|--------------------------|----------------|--------|
| BB | FR-01 | Membership creation — authorized only; no self-create | Canonical Member Feature Spec | MUST | `blessBoardMemberDomainService.js`, staff add-member flow/UI, M01–M05 | `tests/v2-04-bb-member-creation-flow.test.js`, `tests/v2-04-bb-member-domain.test.js`, `tests/v2-04-bb-m01-m02-members.test.js` | NEW |
| BB | FR-02 | Church ID — unique per church (`church_id`), church-controlled, member cannot edit | Canonical Spec + PD-V204-BB-01 | MUST | `119_member_number_church_id.sql`, `manageChurchId`, M08 | member-domain / admin-profile / creation-flow / product-decisions suites | TEMPORARY_APPROVED_FOR_V2_04 |
| BB | FR-03 | First activation — Full Name + Phone + Church ID; email optional | Canonical Spec | MUST | `blessBoardMemberPortalAuthService.js`, member-auth views M13–M19 | `tests/v2-04-bb-member-auth.test.js` | NEW |
| BB | FR-04 | Password policy (≥8, uppercase, special) | Canonical Spec | MUST | member portal auth password validators | `tests/v2-04-bb-member-auth.test.js` | NEW |
| BB | FR-05 | Returning login — Church ID + password | Canonical Spec | MUST | member-auth login routes/templates | `tests/v2-04-bb-member-auth.test.js` | NEW |
| BB | FR-06 | Password recovery via verified contact | Canonical Spec | MUST | Forgot-password / OTP recovery flows | `tests/v2-04-bb-member-auth.test.js` | NEW |
| BB | FR-07 | Lost Church ID — admin-assisted only (no public auto recovery) | Canonical Spec | MUST | Auth UX copy + absence of public ID recovery | auth suite + manual QA01 pack | NEW |
| BB | FR-08 | Member homepage — church-specific member environment | Canonical Spec | MUST | `views/blessboard/v5/member/`, M20 | `tests/v2-04-bb-member-portal.test.js` | NEW |
| BB | FR-09 | Profile — permitted edits; Church ID / official branch protected | Canonical Spec | MUST | profile/edit + phone verify M21–M23; domain profile update | portal + admin-profile suites | NEW |
| BB | FR-10 | Blocking — portal block/unblock without deleting membership/history | Canonical Spec | MUST | `setPortalAccessStatus`, M10 | admin-profile / member-domain / auth blocked gates | NEW |
| BB | FR-11 | Multiple admins — permission-based coexistence | Canonical Spec | MUST | platform RBAC catalogue grants (`members.*`) | domain + request-admin + architecture | NEW |
| BB | FR-12 | Dual experience — leader/admin also uses Member Portal | Canonical Spec | MUST | member shell vs branch-admin / HQ destinations | portal + RBAC suites / manual QA | NEW |
| BB | FR-13 | Manual attendance — scoped authorized recording | Canonical Spec | MUST | attendance session ops + check-in A01–A07 | `tests/v2-04-bb-attendance-*.test.js` | NEW |
| BB | FR-14 | QR attendance — time-limited event QR; duplicate prevention | Canonical Spec | MUST | attendance check-in QR path; session domain `121` | check-in + attendance-domain suites | NEW |
| BB | FR-15 | Requests — ministry/department (and supported) request submit | Canonical Spec | MUST | join request adapter `122`, M24–M27 | portal + `tests/v2-04-bb-request-admin.test.js` | NEW |
| BB | FR-16 | Approvals — pending → scoped review; no self-approve | Canonical Spec | MUST | platform `requestApproval` + BB join adapter; R01–R04 | `tests/v2-04-request-approval.test.js`, request-admin | NEW |
| BB | FR-17 | Privacy — no other-member / admin data for ordinary member | Canonical Spec | MUST | portal scoping / requireActiveMember | portal + isolation cases in member suites | NEW |
| BB | FR-18 | Documents — ordinary member uploads disabled (restriction) | Canonical Spec | MUST | Member workflow surfaces (restriction retained) | final gate / portal suites | NEW |
| BB | FR-19 | Audit — sensitive membership/access/attendance/approval changes | Canonical Spec | MUST | audit timeline partials; correction audit A12–A14 | attendance-correction + domain/admin suites | NEW |
| BB | FR-20 | Admin search — Church ID / name / phone within scope | Canonical Spec | MUST | members directory M01 filters/search | m01-m02 / member-domain | NEW |
| BB | BB-WEBSITE-ENGINE | BlessBoard cutover onto canonical platform website lifecycle/editor/media | `docs/qa/V2_04_BB_PLATFORM_ENGINE_MIGRATION.md`, release notes §C | MUST (platformization) | BB website adapter + lifecycle hooks; no legacy dual-write runtime | `tests/v2-04-bb-website-platform-adapter.test.js`, `tests/v2-04-bb-lifecycle-cutover.test.js`, `tests/v2-04-bb-clean-db-e2e.test.js` | CHANGED |

### 3.2 Business rules register (preserved IDs; not double-counted as separate FEATURE rows)

| FEATURE_ID | Decision (summary) | Ties to | CLASS |
|------------|--------------------|---------|-------|
| BR-01 | Church ID unique within org, not global | FR-02, DR-1 | MUST |
| BR-02 | Alphanumeric church ID schemes / separators | FR-02, DR-2 | MUST |
| BR-03 | Hard-block duplicate Church ID; warn likely person duplicates; no auto-merge | FR-01/02, DR-14 | MUST |
| BR-04 | Membership creation ≠ digital activation | FR-01/03, DR-8 | MUST |
| BR-05 | Membership status ≠ portal access status | FR-10, DR-20/21 | MUST |
| BR-06 | Block preserves membership/history | FR-10, DR-22 | MUST |
| BR-07 | Prefer inactive/archive/former over ordinary hard delete | DR-23 | FOUNDATION |
| BR-08 | Official branch transfer admin-controlled; history preserved | FR-09, DR-19/29 | FOUNDATION |
| BR-09 | Unrelated-church transfer = new membership; no private-data move | DR-30 | FOUNDATION |
| BR-10 | Data model may allow multiple church memberships per person | DR-28 | FOUNDATION |
| BR-11 | Visitor cannot self-convert to Member | FR-01, DR-49 | MUST |

### 3.3 Acceptance criteria register (preserved IDs; QA contract, not separate FEATURE rows)

| IDs | Area | Gate mapping |
|-----|------|--------------|
| AC-01..AC-04 | Identity & membership | Member management PASS (`V2_04_BB_FINAL_QA_RELEASE_GATE`) |
| AC-05..AC-08 | Authentication & recovery | Member auth PASS |
| AC-09..AC-15 | Profile & access | Portal + block/session PASS |
| AC-16..AC-19 | Attendance | Attendance PASS |
| AC-20..AC-24 | Requests & privacy | Requests + privacy PASS |
| AC-25 | Historical integrity via internal `member_id` | Architecture / domain PASS |

### 3.4 Decision Register classes (excerpt — full #1–55 in canonical PDF)

| Class | Decision #s (from canonical register) |
|-------|----------------------------------------|
| MUST | 1–14, 16–19, 21–22, 24–27, 31, 33–34, 36–39, 41–42, 44–45, 47, 49, 51–55 (+ 46 MUST IF CELLS) |
| FOUNDATION | 20, 23, 28–30, 32, 40 |
| RECOMMENDED | 43 (in-app notifications first) |
| RECOMMENDED/DEFER | 48 (bulk import UI) |
| DEFER | 15 (merge), 35 (staff-scans-member QR), 50 (full Visitor journey) |

---

## 4. ActiveClinic V2.04 features (`SPEC_NOT_FOUND` for canonical FR contract)

**SPEC_NOT_FOUND:** No ActiveClinic V2.04 Canonical Feature Specification (FR/AC/BR/decision-class) located in-repo or as a V2.04 Downloads packet.

Inventory below is **only** from release notes + Stitch/implementation docs + git-added tests/migrations (patient foundation). **No invented AC clinical FRs.**

| PRODUCT | FEATURE_ID | FEATURE | SOURCE | CLASS | IMPLEMENTATION_HINT/PATH | TEST_HINT/PATH | STATUS |
|---------|------------|---------|--------|-------|--------------------------|----------------|--------|
| AC | AC-MW-PUBLIC | Stitch public clinic website experiences R01–R12 | `docs/releases/V2_04_RELEASE_NOTES.md` §D; `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md` | MUST (release scope) | AC public views/CSS presentation; Stitch project `8888814012921999511` | `tests/v2-04-ac-stitch-batch-2-*.test.js` … `batch-4-*.test.js` | NEW |
| AC | AC-MW-EDITOR | Stitch inline editor chrome E01–E02 on shared WE01 | Release notes §D; Stitch map | MUST | Shared editor + AC chrome; responsive ≤390px | `tests/v2-04-ac-stitch-batch-5-inline-editor.test.js` | CHANGED |
| AC | AC-MW-HUB | Clinic Website Management Hub H01–H06 | Release notes §D; Stitch map | MUST | `/app/settings/website*` hub surfaces | `tests/v2-04-ac-stitch-batch-6-website-hub.test.js` | NEW |
| AC | AC-WEBSITE-ADAPTER | ActiveClinic website presentation adapter | Release notes §C/E; overnight handoff | MUST | `tests` + AC presentation adapter module(s) under website presentation | `tests/v2-04-ac-website-presentation-adapter.test.js` | CHANGED |
| AC | AC-PATIENT-DOMAIN | Staff Add Patient domain foundation over ACN10/11 (no final Stitch UI claimed in phase report) | `docs/architecture/V2_04_AC_PATIENT_DOMAIN_REPORT.md` | FOUNDATION | `activeClinicPatientDomainService.js`, staff workflow adapter | `tests/v2-04-ac-patient-domain.test.js` | FOUNDATION |

**AC visual / freeze notes (not separate product FRs):** Batch 7 visual parity + Batch 8 freeze; hosted Stitch parity recorded in `V2_04_QA_RELEASE_FREEZE_HANDOFF.md`. Booking remains existing booking engine (Stitch booking entry = chrome/handoff only) — **inherited engine**, not a new AC booking product FR.

---

## 5. Shared platform V2.04 changes

| PRODUCT | FEATURE_ID | FEATURE | SOURCE | CLASS | IMPLEMENTATION_HINT/PATH | TEST_HINT/PATH | STATUS |
|---------|------------|---------|--------|-------|--------------------------|----------------|--------|
| SHARED | PLAT-COLOR-THEME | Shared semantic color architecture; product identities via `[data-product]` | Release notes §A; `V2_04_COLOR_SYSTEM_FINAL_FREEZE.md` | MUST | `src/platform/ui/theme/colors.css`; BB `#6c5ce7` / AC `#006068` | `tests/v2-04-platform-color-theme.test.js`, `tests/v2-04-product-token-cascade.test.js`, `tests/v2-04-color-migration-batch-*.test.js` | NEW |
| SHARED | PLAT-REG-GEOGRAPHY | Shared Country + City registration fields + city autocomplete | Release notes §B; `V2_04_QA_01_*.md` | MUST | `src/platform/geography/*`; shared registration UX | `tests/v2-04-qa-01-shared-registration-location.test.js` | NEW |
| SHARED | PLAT-CITY-CATALOGUE | DB-backed city catalogue (country-aware) | QA-02; migration `044_city_catalogue.sql` | MUST | geography repository/seed | `tests/v2-04-qa-02-platform-city-catalogue.test.js` | NEW |
| SHARED | PLAT-COUNTRY-AVAIL | Registration country availability (disabled countries reject forged POSTs) | QA-03; migration `045_registration_country_availability.sql` | MUST | country availability service/routes | `tests/v2-04-qa-03-platform-country-availability.test.js` | NEW |
| SHARED | PLAT-WEB-PRESENTATION | Shared website presentation model | Release notes §C; overnight handoff | MUST | `src/platform/website/presentation/*` | `tests/v2-04-platform-website-presentation.test.js` | NEW |
| SHARED | PLAT-WEB-COMPONENTS | Shared website component library | Release notes §C | MUST | shared website components | `tests/v2-04-shared-website-components.test.js` | NEW |
| SHARED | PLAT-MEDIA-UPLOAD | Shared media / upload / image infra (singular upload engine) | Release notes §C/E | MUST | shared media editing contracts | `tests/v2-04-shared-website-media-hardening.test.js` | CHANGED |
| SHARED | PLAT-EDITOR-ENGINE | Shared WE01 editor singularity (`SHARED_EDITOR_ENGINE_COUNT=1`) | Release notes §C/E | MUST | `website-inline-edit.js` / shared editor stack | mini-website + release-hardening suites | CHANGED |
| SHARED | PLAT-WEB-LIFECYCLE | Canonical draft/preview/publish/unpublish/version/restore engines (count=1 each) | Freeze handoff §4; BB engine migration | MUST | `src/platform/website/*` lifecycle services | BB/AC lifecycle + release-hardening | CHANGED |
| SHARED | PLAT-ADMIN-WEB-CONSOLE | Platform Admin website governance console (separate from clinic hub) | Release notes §C | MUST | Platform Admin website console routes | `tests/v2-04-platform-admin-website-console.test.js` | NEW |
| SHARED | PLAT-PERSON | Platform Person foundation | `V2_04_PERSON_FOUNDATION_PHASE1.md`; migration `046_person_foundation.sql` | FOUNDATION | `src/platform/person/*` | `tests/v2-04-person-foundation-phase1.test.js` | FOUNDATION |
| SHARED | PLAT-DUP-ENGINE | Shared person duplicate detection engine | `V2_04_DUPLICATE_ENGINE_REPORT.md` | FOUNDATION | `src/platform/person` + product policies | `tests/v2-04-person-duplicate-engine.test.js` | FOUNDATION |
| SHARED | PLAT-STAFF-PERSON-WF | Shared staff-managed person workflow | `V2_04_STAFF_PERSON_WORKFLOW_REPORT.md` | FOUNDATION | staff person workflow services | `tests/v2-04-staff-person-workflow.test.js` | FOUNDATION |
| SHARED | PLAT-APPROVAL-REQ | Shared approval-request foundation | `V2_04_REQUEST_APPROVAL_REPORT.md`; migration `047_approval_request_foundation.sql` | FOUNDATION | `src/platform/requestApproval/*` | `tests/v2-04-request-approval.test.js` | FOUNDATION |
| SHARED | PLAT-MW-CONCURRENCY | Mini-website repeat-edit / true stale rejection | `V2_04_MINI_WEBSITE_REPEAT_EDIT_FIX.md` | MUST | shared draft revision / conflict handling | `tests/v2-04-mini-website-repeat-edit.test.js` | CHANGED |
| SHARED | PLAT-ASSET-VERSION | Static asset / browser cache-bust versioning | Release notes / freeze | MUST | application build / asset version helpers | `tests/v2-04-static-asset-version.test.js` | CHANGED |
| SHARED | PLAT-VERSION-2.04 | About / catalog product version **2.04** (shared V8 scheme) | Release notes; `applicationBuildInfo.js` | MUST | `src/platform/build/applicationBuildInfo.js`, release-notes catalog | `tests/v8-about-version-2.test.js`, `tests/v2-04-release-hardening.test.js` | CHANGED |

---

## 6. Inherited unchanged from V2.03 (not V2.04 NEW)

Documented in `docs/releases/V2_03_RELEASE_NOTES.md` / QA handoff; still present on V4 unless superseded by §3–§5:

| Product | Inherited capability (unchanged product intent) | Notes |
|---------|-----------------------------------------------|-------|
| BB | Pre-V2.04 church website edit/draft/media/publish continuity | V2.04 **changes** engine ownership (see BB-WEBSITE-ENGINE); content domains (events/sermons/etc.) not re-specified as V2.04 member FRs |
| AC | Batch 1 clinic ops (services, practitioners, appointments, patients/consents, reception/queue, clinical worklist, billing, data jobs) | Remains V2.03 capability set |
| AC | Batch 2 staff shell, pharmacy/diagnostics queues, facilities/departments | Remains V2.03 |
| AC | Batch 3 vitals/Rx/referrals; Rooms & Spaces MVP; Clinical Documents MVP; Visit Summary MVP; patient portal bookings/invoices/profile | Remains V2.03 (known gaps still deferred — §7) |
| SHARED | Pre-V2.04 platform consolidation / RBAC catalogue / isolation hardening baseline | Extended by V2.04 person/approval/website/theme work |

**Git signal:** V2.03 → V4 adds `tests/v2-04-*`, platform migrations `044`–`047`, BB migrations `119`–`122`, and Stitch/website/theme docs — not a rewrite of AC Batch 1–3 clinical FR packs.

---

## 7. Deferred / out-of-scope (V2.04)

| PRODUCT | FEATURE_ID | FEATURE | SOURCE | CLASS | IMPLEMENTATION_HINT/PATH | TEST_HINT/PATH | STATUS |
|---------|------------|---------|--------|-------|--------------------------|----------------|--------|
| BB | DR-15 | Sophisticated duplicate-member merge workflow | Canonical Decision #15; final gate Gate 13 | DEFER | Not in candidate | — | DEFERRED |
| BB | DR-35 | Staff-scans-member-QR attendance mode | Canonical Decision #35 | DEFER | Architect-only; not required | — | DEFERRED |
| BB | DR-50 | Full Visitor journey | Canonical Decision #50; non-goals | DEFER | Boundary only: no self-convert (BR-11) | — | DEFERRED |
| BB | DR-48 | CSV bulk import UI | Canonical Decision #48 | RECOMMENDED/DEFER | Architecture may exist; complete UI not claimed | — | DEFERRED |
| BB | BB-NONGOAL-NOTIFY | Advanced multi-channel notification configuration | Canonical non-goals; DR-43 RECOMMENDED in-app-first | DEFER / RECOMMENDED | In-app-first preferred; advanced config out | — | DEFERRED |
| BB | BB-NONGOAL-XFER-UX | Complete cross-church membership transfer UX | Canonical non-goals; BR-09 foundation rule only | DEFER | Foundation rule only | — | DEFERRED |
| BB | DR-28-UX | Complex multi-membership switching UX | Decision #28 FOUNDATION (data) / status PDF | FOUNDATION (data) / UX DEFER | Data-model foundation only | — | DEFERRED |
| AC | AC-E01-E02-POLISH | Editor visual chrome polish E01/E02 | Freeze handoff; BACKLOG V2.05 | POST_QA_POLISH | Not V2.04 blocker | Batch 5/7 suites exist; polish deferred | DEFERRED |
| AC | AC-H03-H06-FUTURE | Nine H03/H06 FUTURE_CAPABILITY controls (informational) | Freeze handoff | DEFER (future capability) | Must remain non-false-active | hub batch tests | DEFERRED |
| AC | AC-STITCH-MED-GAPS | Remaining documented medium Stitch visual gaps | Freeze handoff; BACKLOG V2.05 | DEFER | Post-QA polish | — | DEFERRED |
| AC | ACN18-BINARIES | Clinical Documents private binary attachments | V2.03 limitations (still out of V2.04) | DEFER | Inherited deferral | — | DEFERRED |
| AC | ACP05-PDF | Visit Summary PDF / private storage | V2.03 limitations | DEFER | Inherited deferral | — | DEFERRED |
| AC | ACN27-OCCUPANCY | Rooms occupancy / scheduling engine | V2.03 limitations | DEFER | Inherited deferral | — | DEFERRED |

---

## 8. UNKNOWN

No V2.04 feature rows classified **UNKNOWN** after source review. Items without an AC FR-style ID are labeled **`SPEC_NOT_FOUND`** at the product-contract level (ActiveClinic), not UNKNOWN features.

| PRODUCT | FEATURE_ID | FEATURE | SOURCE | CLASS | STATUS |
|---------|------------|---------|--------|-------|--------|
| — | — | _(none)_ | — | — | UNKNOWN |

---

## 9. Screen packaging reference (BB)

| IDs | Area | Required | Role vs FR |
|-----|------|---------:|------------|
| BB-M01..M12 | Member administration | 12 | UI for FR-01/02/09/10/19/20 (+ admin flows) |
| BB-M13..M27 | Auth + portal | 15 | UI for FR-03..09, FR-15..18 |
| BB-A01..A14 | Attendance | 14 | UI for FR-13/14/19 |
| BB-R01..R04 | Request admin | 4 | UI for FR-15/16 |
| **Total** | | **45** | Canonical Stitch requirement IDs (final gate) |

---

## 10. Count methodology (footer)

- **BB_V204_FEATURES** = BB rows in §3.1 with STATUS ∈ {NEW, CHANGED, FOUNDATION} → **21**
- **AC_V204_FEATURES** = AC rows in §4 with STATUS ∈ {NEW, CHANGED, FOUNDATION} → **5**
- **SHARED_V204_FEATURES** = SHARED rows in §5 with STATUS ∈ {NEW, CHANGED, FOUNDATION} → **17**
- **DEFERRED** = rows in §7 with STATUS = DEFERRED → **13**
- **UNKNOWN** = rows in §8 → **0**

BR-* and AC-* (BlessBoard acceptance criteria) are preserved in §3.2–§3.3 and are **not** added into the BB feature count (avoids double-counting with FR-*).

---

## 11. Audit caveats

1. Canonical BB specification PDFs live **outside** the git tree (Downloads). In-repo gates/handoffs reference the same FR areas and 45-screen inventory but do not embed the full FR/AC/BR text.
2. Two V2.04 freeze SHAs exist: website/theme/geography candidate `c16c791f…` and later BB member gate candidate `b8e9f4a1…` (HEAD also includes subsequent docs/member release-note commits). Inventory covers **both** V2.04 scopes on branch `V4`.
3. ActiveClinic lacks an FR-register V2.04 spec; AC rows must not be treated as equivalent-authority to BB FR-*.
4. This document does **not** judge implementation completeness or test gaps — inventory only.

---

BB_V204_FEATURES=21
AC_V204_FEATURES=5
SHARED_V204_FEATURES=17
DEFERRED=13
UNKNOWN=0
FINAL=V2_04_FEATURE_INVENTORY_COMPLETE
