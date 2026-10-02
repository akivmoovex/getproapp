# ActiveClinic V2.03 — New Stitch screens ingestion audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_NEW_STITCH_SCREEN_AUDIT` |
| **Date** | 2026-09-26 |
| **Mode** | **READ-ONLY** — no application/CSS/DB/migration/deploy changes |
| **Application release SHA** | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| **Testing DB remediation** | `V2_03_TESTING_DB_REMEDIATION_PASS` (orthogonal) |
| **Stitch project** | `projects/7300898757945019896` ([stitch.withgoogle.com/projects/7300898757945019896](https://stitch.withgoogle.com/projects/7300898757945019896)) |
| **Prior Batch 3 Stitch** | `projects/3741389873539108242` (implemented leaves + earlier deferred drafts) |
| **Release candidate verdict** | **Unchanged** — not rewritten by this audit |

---

## Verdict

**V2_03_NEW_STITCH_SCREENS_REQUIRE_PRODUCT_DECISIONS**

The six expected screens are present and correctly labeled as ACN18 / ACN27 / AC-P05 desktop+mobile pairs. New HTML **does not unlock** safe V2.03 implementation: repository still lacks clinical-document domain, room inventory domain, and patient visit-summary release/projector. Design tokens on most of the six lean Material 3 tonal blues, not the frozen V2.03 staff/portal palette.

---

## 1. Screen ingestion

### Target six (confirmed)

| # | Stitch title | Device | Screen ID | Pair |
|---|--------------|--------|-----------|------|
| 1 | ACN18 — Clinical Documents — Desktop | DESKTOP 2560×2498 | `9b5d55cc2e8445f5bf97ef98f00cf8d3` | ACN18 |
| 2 | ACN18 — Clinical Documents — Mobile 390px | MOBILE 780×3730 | `ee65f85e2f484eb9b147dc06c97949ad` | ACN18 |
| 3 | ACN27 ActiveClinic Rooms & Spaces | DESKTOP 2560×2570 | `b8f071b326234022afb3eecc665be9bc` | ACN27 |
| 4 | ACN27 ActiveClinic Rooms & Spaces (Mobile) | MOBILE 780×3750 | `74a8167ce99e45388a7dd1fbe9a92a88` | ACN27 |
| 5 | AC-P05 — Visit Summary — Desktop | DESKTOP 2560×4536 | `cd4b21d6860843c6b6862f92326857af` | AC-P05 |
| 6 | AC-P05 — Visit Summary — Mobile 390px | MOBILE 780×4472 | `5df55128997f4b9b916852f26b972bb5` | AC-P05 |

These **replace prior deferred draft IDs** recorded in open decisions (from project `374138…`). Treat **this project’s IDs** as the current visual source for planning.

### Per-screen purpose / structure

#### ACN18 — Clinical Documents (staff)

- **Purpose:** Encounter-scoped clinical document archive for a patient (notes, certificates, referral letters, discharge summaries, lab/rad attachments).
- **Major sections:** Staff shell (sidebar/top); patient context banner; document list with type/status filters; document cards/rows; upload / add document CTAs; view/download actions; empty/HIPAA chrome.
- **Actions:** Upload Scan, Add Document, View Document, Download PDF, filters (type/status/date), overflow menus.
- **Forms:** Filter selects; implied create/upload flows (drawer/modal chrome in design).
- **Tables/cards:** Desktop denser list/table; mobile stacked cards with status chips (Signed / Final / Draft).
- **Responsive:** Desktop staff shell `w-64` sidebar + `h-14` top; mobile back-stack + bottom chrome; touch targets called out (~44px).

#### ACN27 — Rooms & Spaces (ops)

- **Purpose:** Facility-scoped room/space inventory (exam, triage, treatment, etc.) with occupancy/maintenance status — **not** B2-10 facility catalogue.
- **Major sections:** Staff shell; facility switcher (Main Campus / East Annex / …); KPI strip; room table (desktop) / cards (mobile); edit drawer (Room Name, Code, Type, Department, Floor/Area, Description, Status, Capabilities).
- **Actions:** Add Room, Edit Space, Set In-Use, filters by department/type/status, Reactivate.
- **Responsive:** Desktop `w-64` / `h-14`; mobile list + bottom nav; ACN27 **mobile** is closer to V2.03 blue tokens than desktop.

#### AC-P05 — Visit Summary (patient portal)

- **Purpose:** Patient-facing completed visit summary with clinical narrative, vitals, meds, follow-up, billing notice, PDF/print.
- **Major sections:** Patient portal chrome; visit header (date, provider, service, status Completed); Reason for Visit; Clinical Summary & Vitals; Procedures; Medications; Follow-up; Invoice link; Download/Print.
- **Actions:** Back to Bookings, Download Visit Summary / PDF, Print, View Invoice.
- **Responsive:** Portal layout (no staff sidebar); mobile stacked cards + bottom chrome.

### Unexpected / duplicate screens in the same project

Project `7300898757945019896` also contains **many Batch 2 reference screens** (AC-B2-01…10 desktop/mobile, including duplicate billing titles). These are **not** the six newly requested targets. No unexpected seventh “new product leaf” beyond ACN18/ACN27/AC-P05 pairs was required for this audit. Billing desktop appears more than once — treat as Stitch inventory noise, not a new product code.

---

## 2. Design system compliance

**Expected (frozen V2.03):** Inter; `#2563EB` / `#1D4ED8` / `#EFF6FF`; text `#111827` / `#6B7280`; border `#E5E7EB`; bg `#F8FAFC`; surfaces `#FFFFFF`; 8px buttons / 12px cards; staff desktop 256×56; staff mobile 56 top / 64 bottom; portal shell for AC-P05; ≥44px targets.

| Screen | Inter | Primary `#2563EB` family | Shell chrome | Assessment |
|--------|-------|---------------------------|--------------|------------|
| ACN18 desktop | Yes (explicit) | Sparse; dominated by MD3 `#FAF8FF` / `#004AC6` / `#B4C5FF` | `w-64` + `h-14` present | **WITH_GAPS** |
| ACN18 mobile | (via theme) | Same MD3 lean | Mobile top/bottom patterns | **WITH_GAPS** |
| ACN27 desktop | — | MD3 lean | `w-64` + `h-14` | **WITH_GAPS** |
| ACN27 mobile | — | Stronger `#2563EB` / `#1D4ED8` / `#EFF6FF` / `#F8FAFC` | Mobile bottom nav | **Closer — WITH_GAPS** (slate neutrals `#64748B` vs `#6B7280`) |
| AC-P05 desktop | — | MD3 lean | Portal (no staff sidebar) | **WITH_GAPS** |
| AC-P05 mobile | — | MD3 lean | Portal mobile | **WITH_GAPS** |

**Overall design system: WITH_GAPS** (layout chrome largely aligned; color language largely **not** frozen V2.03 — MD3 tonal system). Do **not** retoken in this audit.

---

## 3–4. ACN18 backend + security

### Capability map (Stitch → repo)

| Visible capability | Classification | Evidence |
|--------------------|----------------|----------|
| Document list by patient/encounter | **NEW_DOMAIN_REQUIRED** | No `clinical_documents` (or equivalent) table/routes |
| Document type taxonomy (notes/letters/certs/reports/attachments) | **NEW_DOMAIN_REQUIRED** | — |
| Title / created-by / status (draft/final/signed) | **EXISTING_BACKEND** only for **consultation notes** (`consultation_notes.status` draft\|signed) — **not** a general document archive | `015_clinical_encounters.sql` |
| Encounter association | **EXISTING_BACKEND** for notes/orders/vitals on encounters | encounters + child tables |
| File attachment / upload / download / PDF | **NEW_DOMAIN_REQUIRED** (+ **UNSUPPORTED_DEMO_ONLY** for DICOM/HL7 CDA/FHIR chrome) | Website `website.media.*` ≠ clinical PHI store |
| Document detail + activity/history | **NEW_DOMAIN_REQUIRED** (events pattern exists elsewhere as precedent only) | — |
| Filters / empty states / patient banner | **EXISTING_BACKEND_NEEDS_PRESENTATION** *after* domain exists | Shell/patient context patterns reusable |

Closest existing clinical truth: **encounters**, **consultation_notes**, **clinical_orders**, **vital_sign_observations**, **encounter_events**. These are **not** an EHR document library.

### Permissions

Existing related keys: `activeclinic.encounter.view|manage`, `activeclinic.consultation.record|sign`, `activeclinic.clinical_order.create`, alert keys.  
**Missing:** any clinical-document view/create/finalize/download keys.  
**Must not invent names** until product+security sign-off.  
**PHI:** documents are Tier-1 clinical PHI; download/view needs audit; CMS media permissions are **wrong** scope.

### ACN18 readiness

| Lens | Result |
|------|--------|
| Backend | **NEW_DOMAIN_REQUIRED** |
| Security | **SECURITY_DECISION_REQUIRED** |
| Collision | **MEDIUM** vs B2-06 / ACN15 workspace (notes live there); **LOW** vs ACN17/19 (vitals/Rx leaves — different objects) |
| Decision | **DEFER_NEW_DOMAIN** + **DEFER_SECURITY_DECISION** |
| Implement now? | **No** |

### Minimum backend contract (if product later authorizes)

1. Tables: `clinical_documents` (+ optional `clinical_document_events`, attachment metadata) scoped `organization_id` / `healthcare_organization_id` / `facility_id` / `patient_id` / optional `encounter_id`.
2. Columns (min): type, title, status (draft|final|signed|…), created_by_staff_id, storage pointer (not website CMS), timestamps/version.
3. Services/routes: list/create/finalize/download under `/app/clinical/...` — not website media.
4. Permissions: new catalogue keys + role matrix + download audit events.
5. Explicit non-goals for V2.03-safe MVP: DICOM viewer, HL7/FHIR export, auto-generated certificates.

---

## 5–6. ACN27 backend + hierarchy

### Search result

**No** `rooms` / `spaces` / `exam_room` / `facility_rooms` persistence in ActiveClinic schema.

| Near-miss | Why not ACN27 |
|-----------|----------------|
| `activeclinic.facilities` | B2-10 **site** catalogue |
| `activeclinic.departments` | Facility-scoped **module** departments (reception/opd/…) |
| `activeclinic.service_points` | **Reception queue** points — not clinical room inventory / occupancy |

Stitch fields (Name, Code, Type, Department, Floor/Area, Description, Status, Capabilities) have **no** matching room persistence. Overloading `facilities` or `service_points` would be incorrect.

### Hierarchy recommendation (repo evidence)

Canonical comment in `022_facility_departments.sql`:

> organization → healthcare_organization → facility → department

**Recommendation:** Room belongs to **FACILITY with optional DEPARTMENT** (same pattern as departments themselves: facility-required, department optional assignment for filtering/ops). Not org-direct; not department-only (rooms exist when department inactive/unassigned).

Stitch UI already nests under a selected facility (“Main Campus → Rooms & Spaces”) and filters by department — consistent with this.

### ACN27 readiness

| Lens | Result |
|------|--------|
| Backend | **NEW_DOMAIN_REQUIRED** |
| Hierarchy | **PRODUCT_DECISION_REQUIRED** to confirm facility+optional department (recommended) |
| Collision | **HIGH** vs **B2-10** if mis-routed into `/app/facilities`; **NONE/LOW** if separate `/app/.../rooms` under facility context |
| Decision | **DEFER_NEW_DOMAIN** (+ hierarchy decision) |
| Implement now? | **No** |

### Minimum backend contract (if authorized)

1. Table `facility_rooms` (name TBD): facility_id required; department_id nullable; room_code unique per facility; room_type; floor/area text; description; status; capabilities JSON/flags; org/HCO FKs.
2. Soft status only (active / inactive / maintenance / in_use if occupancy is in-scope — occupancy may be **phase-2**).
3. Routes under facility ops — **must not** replace B2-10.
4. Permissions: facility/update-adjacent or new room manage keys — product decides; do not invent here.
5. Non-goals: live HL7/POS sync chrome in Stitch.

---

## 7–8. AC-P05 backend + release/security

### Field map

| Stitch field | Staff data exists? | Patient-safe release exists? | Classification |
|--------------|--------------------|------------------------------|----------------|
| Facility / date / provider / service / booking ref | Partially via appointments/bookings | **Portal bookings (AC-P03/04)** | **EXISTING_BACKEND_NEEDS_PRESENTATION** (meta only) |
| Encounter completed status | `encounters.status` | **No patient projector** | Internal only |
| Reason for visit / clinical summary narrative | consultation notes / triage | **No** | **NEW_RELEASE_MODEL_REQUIRED** |
| Vitals | `vital_sign_observations` | **No** | **NEW_RELEASE_MODEL_REQUIRED** |
| Medications / Rx | clinical_orders / pharmacy | **No** patient med list release | **NEW_RELEASE_MODEL_REQUIRED** |
| Follow-up | `clinical_follow_up_items` | **No** patient release | **NEW_RELEASE_MODEL_REQUIRED** |
| Invoice link | billing | **Yes** AC-P06 invoices | **EXISTING_BACKEND** |
| Download PDF visit summary | — | **No** | **NEW_DOMAIN_REQUIRED** / release artifact |

**Explicit:** repository has **no** `released_to_patient`, `patient_visible`, `visit_summary_published`, or equivalent release flag/table. Encounter `completed` ≠ patient-released.

### AC-P05 readiness

| Lens | Result |
|------|--------|
| Backend (full Stitch) | **NEW_RELEASE_MODEL_REQUIRED** |
| Security | **SECURITY_DECISION_REQUIRED** |
| Collision | **MEDIUM** vs AC-P03/04 (entry from bookings); **LOW** vs AC-P06/07 (invoice/profile adjacent); must not dump raw notes into portal |
| Decision | **DEFER_SECURITY_DECISION** |
| Safe subset without clinical PHI | Possible **later** as bookings meta + invoice link only — **not** current Stitch fidelity |
| Implement now? | **No** |

### Minimum release contract (if authorized)

1. Explicit release record: who released, when, which encounter/appointment, which field bundle version.
2. Patient portal route only reads **released** projections (never raw `consultation_notes`).
3. Default denylist: unsigned drafts, staff-only alerts, internal codes.
4. Audit on view/download.
5. Optional PDF as generated artifact of released projection — not staff chart dump.

---

## 9. Cross-screen reuse (planning only)

| Pattern | Class |
|---------|-------|
| Staff shell sidebar/top/bottom | **ACTIVECLINIC_SHARED** |
| gp-ops / list filter / status chips | **PLATFORM_SHARED** / **ACTIVECLINIC_SHARED** |
| Patient context banner (staff) | **ACTIVECLINIC_SHARED** (clinical) |
| Document card/table | **DOMAIN_SPECIFIC** (ACN18) |
| Room table + edit drawer | **DOMAIN_SPECIFIC** (ACN27) |
| Portal cards / back-to-bookings | **ACTIVECLINIC_SHARED** (portal) |
| History/timeline | **DOMAIN_SPECIFIC** per leaf |
| Empty states / badges | **ACTIVECLINIC_SHARED** chrome, **SCREEN_LOCAL** copy |

---

## 10. Collision summary

| Pair | Severity | Boundary |
|------|----------|----------|
| ACN18 vs B2-06 / ACN15 | **MEDIUM** | Encounter workspace owns notes; ACN18 is archive/attachment domain — must not fork note editor |
| ACN18 vs ACN17 / ACN19 | **LOW** | Vitals / Rx are leaf editors; documents are separate objects |
| ACN27 vs B2-10 | **HIGH** | Facilities catalogue ≠ room inventory; separate IA required |
| AC-P05 vs AC-P03/04 | **MEDIUM** | Navigation from bookings; summary must not become second booking detail |
| AC-P05 vs AC-P06/07 | **LOW** | Invoice/profile already patient-safe; clinical dump is the risk |

---

## 11. Implementation decisions (one each)

| Code | Decision |
|------|----------|
| **ACN18** | **DEFER_NEW_DOMAIN** (also security-gated) |
| **ACN27** | **DEFER_NEW_DOMAIN** (also product hierarchy) |
| **AC-P05** | **DEFER_SECURITY_DECISION** |

None of: `IMPLEMENT_NOW_EXISTING_BACKEND` / `IMPLEMENT_NOW_SMALL_ADDITIVE_BACKEND`.

---

## 12. Implementation sequence (after human decisions)

1. **ACN27** — once hierarchy + B2-10 non-collision signed; lowest patient-PHI blast radius relative to the other two.
2. **ACN18** — after storage + RBAC + PHI audit model signed.
3. **AC-P05** — last; requires release/projector security before any clinical fields.

If product authorizes a **non-clinical** portal stub later, it still must not claim Stitch parity for clinical summary.

---

## 13. Human decisions required

1. **ACN18:** Authorize new clinical-document domain + storage adapter vs permanent defer; categories/lifecycle; RBAC key matrix; forbid website-media reuse.
2. **ACN27:** Confirm facility + optional department hierarchy; separate route from B2-10; whether occupancy/in-use is MVP or phase-2.
3. **AC-P05:** Release trigger (clinician publish vs auto-on-complete); patient-visible field contract; PDF/download policy; explicit ban on raw chart projection.
4. **Design:** Whether new Stitch MD3 palette must be remapped to frozen V2.03 tokens before any UI build (recommended: remap; do not ship MD3 into staff tokens).

---

## 14. Safety

| Item | Value |
|------|--------|
| Application code modified | **NO** |
| Database modified | **NO** |
| Production touched | **NO** |
| RC freeze verdict changed | **NO** |

---

## Related

- `docs/v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md` (updated Stitch IDs + pointer to this audit)
- `docs/qa/V2_03_BATCH3_FINAL_PARITY_AUDIT.md`
- Implemented Batch 3: ACN17, ACN19, ACN20, AC-P03, AC-P04, AC-P06, AC-P07
