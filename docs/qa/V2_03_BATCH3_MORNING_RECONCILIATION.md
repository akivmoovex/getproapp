# ActiveClinic V2.03 Batch 3 — Morning Reconciliation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_MORNING_RECONCILIATION` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Previous HEAD** | `a2a01c84c9bba55074286d205ceb4c7cf7ddddaa` |
| **Frozen B1+B2 RC** | `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` |
| **Verdict** | `V2_03_BATCH3_RECONCILED_READY_FOR_BLOCKER_DECISIONS` |
| **Production** | **NO** (not pushed, not deployed) |

---

## 1. Worktree classification

| Class | Items | Commit with Batch 3? |
|-------|-------|----------------------|
| **A REQUIRED_BATCH3_CODE** | None pending (app portal stamp already correct at tip) | — |
| **B REQUIRED_BATCH3_TEST** | `tests/activeclinic-batch3-acp04.test.js` (stamp assertion fix) | **YES** |
| **C REQUIRED_BATCH3_DOC** | `docs/v2.03/ACTIVECLINIC_BATCH3_PREPARATION_MODE.md`, `…_PREIMPLEMENTATION_ANALYSIS.md`, `…_OPEN_DECISIONS.md`, `docs/qa/V2_03_BATCH3_OVERNIGHT_CHECKPOINT.md`, this morning recon doc | **YES** |
| **D B1_B2_FREEZE_DOC** | Dirty `docs/qa/V2_03_BATCH2_ENGINEERING_FREEZE.md` (hosted-gate rewrite saying **STOP — do not start Batch 3**) | **EXCLUDE** — contradicts completed Batch 3; keep separate from recon commit |
| **E OPTIONAL_REFERENCE** | `docs/qa/references/v2-03-batch1-stitch/`, `docs/qa/V2_02_QA_RELEASE_HANDOFF.md` | **EXCLUDE** |
| **F OLD_V2_01** | All `docs/qa/V2_01_*`, `scripts/local/_tmp_v2_01_*`, `docs/qa/references/v2-01-*` | **EXCLUDE** |
| **G DUPLICATE_JUNK** | All `"* 2.*"` / `"* 2/"` Finder duplicates across db/docs/src/tests/views | **EXCLUDE** |
| **H UNKNOWN** | Misc untracked V8 platform/forms/release-notes duplicates already classified as G/F | **EXCLUDE** |

### Identified specifically

| Item | Class | Action |
|------|-------|--------|
| Uncommitted freeze document change | D | Leave unstaged; do not fold into Batch 3 |
| Batch 3 prep / analysis / open decisions | C | Commit |
| Overnight checkpoint | C | Commit (updated) |
| Morning reconciliation | C | Commit |

---

## 2. AC-P04 investigation

| # | Finding |
|---|---------|
| 1 | **Appointment Detail & Reschedule** — patient portal booking detail with cancel/reschedule request |
| 2 | Stitch desktop `497d0c05f6f241f981d07b47be7c7606` · mobile `0af4b000cec2477389a576b11b33cba0` (project `3741389873539108242`) |
| 3 | Overnight **Prompt 5** (inferred AC-P04 leaf after AC-P03/P07); preimpl lists AC-P04 as Batch 3 portal parity |
| 4 | Commit **`f69c6b49`** — `V2.03 Batch 3 AC-P04 appointment detail leaf` |
| 5 | Files: `booking-detail.ejs`, `ac-patient.css`, `renderActiveClinicPatient.js` (stamp), `tests/activeclinic-batch3-acp04.test.js`, pass doc; tiny acp03 test stamp prefix tweak |
| 6 | Route: `GET/POST /clinics/:clinicKey/patient/bookings/:reference` (+ `/reschedule`, `/cancel`) |
| 7 | View: `views/activeclinic/patient/booking-detail.ejs` |
| 8 | Services: `getPatientBooking`, `requestPatientBookingReschedule`, `requestPatientBookingCancellation` (existing) |
| 9 | Auth: patient portal session + CSRF (not staff RBAC) |
| 10 | **Legitimate Batch 3 scope** — in preimpl matrix; overnight matrix omission was reporting gap only |
| 11 | **No B1/B2 collision** — staff Appointment Detail untouched; portal bookings only |
| 12 | **Keep** |

**Classification:** `ACP04_VALID_BATCH3_IMPLEMENTATION`

---

## 3. AC-P04 test failure — root cause & fix

| Question | Answer |
|----------|--------|
| Mode | **A** — application asset version correct; test expectation stale |
| Canonical portal stamp | Single constant `ASSET_VERSION` in `renderActiveClinicPatient.js` = **`v2-03-b3-acp06-01`** (advanced intentionally by AC-P06 CSS leaf) |
| Canonical staff shell stamp | `SHELL_ASSET_VERSION` = **`v2-03-b3-acn20-01`** |
| Not B | AC-P06 correctly bumped shared portal cache after CSS change |
| Not C | One portal constant; one shell constant — consistent, not fragmented |
| Fix | AC-P04 test now asserts against exported `ASSET_VERSION` (no hard-coded stale leaf id) |
| App change | **None** |

---

## 4. Five-commit audit (`6fb754eb..a2a01c84`)

| SHA | Screens | App | Tests | Shared / tokens / shell / nav | Backend | DB | Collision risk |
|-----|---------|-----|-------|-------------------------------|---------|-----|----------------|
| `4550b501` | ACN17, ACN19 | vitals + Rx EJS, `ac-app.css`, clinical routes/loader, shell **cache bump only** | batch3-acn17-acn19 + clinical-ui-parity stitch IDs | No tokens; shell version only; no nav architecture | Reuse vitals/orders | None | Low |
| `cdcc9d4c` | AC-P03, AC-P07 | bookings/profile EJS, `ac-patient.css`, portal render stamp, tiny portal routes locals | batch3-acp03-acp07 | Portal CSS only | Reuse portal booking/profile | None | None vs staff |
| `f69c6b49` | AC-P04 | booking-detail EJS, portal CSS, portal stamp | batch3-acp04 | Portal CSS only | Reuse booking get/reschedule/cancel | None | None vs staff appt detail |
| `0c68c38d` | ACN20 | referrals EJS, clinical routes/loader, shell cache bump, `ac-app.css` | batch3-acn20 | Shell version only; nav highlight reuses Follow-up | Reuse follow-up list/status | None | Resolved as B |
| `a2a01c84` | AC-P06 (ACN27 blocked) | invoices EJS, portal billing service, portal routes, patient-nav link, portal stamp | batch3-acp06 | Portal nav link only | Additive portal read | None | Resolved portal≠staff |

**Frozen B1+B2 infra:** **JUSTIFIED CHANGE** only (shell/portal **asset version strings** + leaf CSS/EJS). No `ac-app-tokens.css`, no shell IA, no facilities/billing/pharmacy/diagnostics engines replaced.

---

## 5. Blocked screens (no implementation)

### ACN18 — Clinical Documents

| Field | Value |
|-------|--------|
| STITCH PURPOSE | Encounter-scoped EHR document archive (upload/index/export; PDF/DICOM/HL7) |
| ACTOR | Clinical staff |
| EXISTING ROUTE | **None** |
| EXISTING BACKEND | **None** (CMS media ≠ clinical) |
| EXISTING UI OVERLAP | Consultation notes / website media (non-equivalent) |
| EXACT BLOCKER | No document domain + open storage/taxonomy decisions |
| PRODUCT DECISION | Storage adapter vs blob store; categories; lifecycle |
| TECHNICAL DECISION | Schema, signed download, audit |
| SECURITY/RBAC | New PHI keys + access audit required |
| CAN IMPLEMENT WITHOUT NEW BACKEND | **NO** |

### ACN27 — Locations Management

| Field | Value |
|-------|--------|
| STITCH PURPOSE | Room/location inventory under Facilities & Departments |
| ACTOR | Ops / facility admin staff |
| EXISTING ROUTE | Canonical **`/app/facilities`** = B2-10 site catalogue (not rooms) |
| EXISTING BACKEND | Facilities + departments — **no room inventory** |
| EXISTING UI OVERLAP | B2-10 facilities list |
| EXACT BLOCKER | Room domain missing; presenting rooms as facilities = contradictory |
| PRODUCT DECISION | New room model vs defer vs redesign Stitch |
| TECHNICAL DECISION | Schema if product chooses rooms; **must not** replace `/app/facilities` |
| SECURITY/RBAC | Would need location manage keys if built |
| CAN IMPLEMENT WITHOUT NEW BACKEND | **NO** |
| vs B2-10 class | **`FACILITY_ALTERNATE_WORKSPACE`** (room inventory) — **not** detail/edit leaf of current facilities; treating as facilities list = **`FACILITY_DUPLICATE`** risk |

### AC-P05 — Visit Summaries

| Field | Value |
|-------|--------|
| STITCH PURPOSE | Patient portal past-care visit summaries / after-care |
| ACTOR | Patient portal user |
| EXISTING ROUTE | **None** |
| EXISTING BACKEND | Staff encounters/notes exist; **no** patient release projector |
| EXISTING UI OVERLAP | Portal bookings (schedule only); staff ACN15 notes |
| EXACT BLOCKER | Release policy + patient-safe projection missing |
| PRODUCT DECISION | Who releases; field contract |
| TECHNICAL DECISION | Publish table/query; optional PDF |
| SECURITY/RBAC | Patient-visible PHI model required |
| CAN IMPLEMENT WITHOUT NEW BACKEND | **NO** |

---

## 6. Implemented screen gaps

| Screen | Gap kinds | Release-blocking? | Detail |
|--------|-----------|-------------------|--------|
| ACN17 | DEMO_DATA_OMITTED, BACKEND_UNSUPPORTED, VISUAL_ONLY | **No** | No multi-vital batch, pain-as-type, sparkline, auto BMI |
| ACN19 | DEMO_DATA_OMITTED, BACKEND_UNSUPPORTED, FUNCTIONAL (CDS) | **No** (CDS intentionally blocked product-wide) | No catalogue search, multi-line draft cards, CDS/EPCS |
| ACN20 | BACKEND_UNSUPPORTED, DEMO_DATA_OMITTED, FUNCTIONAL | **No** for B-scope | Full CRM/HL7/PDF omitted by design; B presentation shipped |
| AC-P03 | DEMO_DATA_OMITTED, CONTENT | **No** | Calendar widget, visit summaries, lab notes, FAQ |
| AC-P04 | DEMO_DATA_OMITTED, BACKEND_UNSUPPORTED | **No** | Live slot calendar, QR, ratings, maps, .ics/PDF |
| AC-P06 | DEMO_DATA_OMITTED, FUNCTIONAL | **No** | Pay Now, insurance, PDF — read-only intentional |
| AC-P07 | DEMO_DATA_OMITTED, CONTENT | **No** | Pronouns, preferred language, landline, emergency block |

**Release-blocking gaps among implemented:** **none** identified.  
**Non-blocking:** all WITH_GAPS items above + intentional B-scope for ACN20.

---

## 7. Shared infra collision check

| Primitive | Batch 3 reuse | Unnecessary duplicate? |
|-----------|---------------|------------------------|
| `ac-app-tokens.css` | Untouched; leaf CSS uses `var(--ac-*)` | No |
| gp-ops / `.ac-ops-queue` | Staff clinical leaves stay in existing ops patterns | No new competing system |
| listQuery / money / history / jobs | Portal billing uses `formatMoney`; no new money helper | No |
| Buttons/cards/tables/badges | Portal `--acp-*` + staff leaf classes | Acceptable product separation |
| Patient vs clinical context | Portal shell vs staff shell preserved | No |
| Billing presentation | New portal invoices view; staff billing EJS unused | Correct |
| Facilities presentation | Untouched; ACN27 blocked | Correct |

**No refactor performed** (debt only).

---

## 8. Tests (post-fix)

### Batch 3 focused — **11 pass / 0 fail**

### B1/B2 touched-domain + shell + RBAC — **41 pass / 0 fail**

(same pack as overnight checkpoint)

### Combined

| | |
|--|--|
| **total** | **52** |
| **failures** | **0** |

Gates: Batch 3 PASS · B1+B2 PASS · RBAC PASS · tenant isolation PASS · facility isolation PASS

---

## 9. Production

**Untouched. No push. No deploy.**

---

## Marker

`ACTIVECLINIC_V2_03_BATCH3_MORNING_RECONCILIATION`

`V2_03_BATCH3_RECONCILED_READY_FOR_BLOCKER_DECISIONS`
