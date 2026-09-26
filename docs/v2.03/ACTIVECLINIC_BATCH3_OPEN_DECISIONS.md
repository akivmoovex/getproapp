# ActiveClinic V2.03 Batch 3 — Open Decisions & Scope Freeze

**Status:** V2.03 Batch 3 **final scope freeze** — deferred screens remain unimplemented.  
**Date:** 2026-09-26  
**Branch:** `V10`  
**Stitch project:** `projects/3741389873539108242`  
**Authority:** Batch 3 Stitch, preimplementation analysis, preparation mode, collision/decision gates, final parity audit.

**Rule:** Do not invent product answers, placeholder backends, fake/demo persistence, or force deferred Stitch onto frozen B1+B2 owners.

---

## V2.03 Batch 3 scope summary

### IMPLEMENTED

| Code | Title |
|------|-------|
| **ACN17** | Vitals & Observations |
| **ACN19** | Prescription Editor |
| **ACN20** | Referral Management (B over `pending_referral`) |
| **AC-P03** | My Appointments |
| **AC-P04** | Appointment Detail & Reschedule |
| **AC-P06** | Invoices & Receipts (portal read) |
| **AC-P07** | Profile & Contact Details |

### DEFERRED (explicit — not implementation failures)

| Code | Freeze class | One-line reason |
|------|--------------|-----------------|
| **ACN18** | `DEFERRED_PRODUCT_BACKEND_SECURITY` | No clinical-document domain; needs product + persistence + PHI/security |
| **ACN27** | `DEFERRED_PRODUCT_BACKEND` | Rooms/location workspace ≠ B2-10 sites; cannot leaf safely |
| **AC-P05** | `DEFERRED_PRODUCT_SECURITY` | No release/projector; needs product + backend + patient PHI security |

See also: `docs/qa/V2_03_BATCH3_FINAL_PARITY_AUDIT.md`.

---

## ACN18 — Clinical Documents

**Stitch:** Desktop `13053c54723e41e1aad43f5343e7c753` · Mobile `22222fdd59f7474fbe1dfb9967b6747c`  
**Freeze:** `DEFERRED_PRODUCT_BACKEND_SECURITY`

### Why outside safe V2.03 scope

Staff encounter-scoped EHR document archive (upload/index/export; PDF/DICOM/HL7). V10 has **no** clinical document routes, services, tables, or RBAC keys. Website CMS media is **not** an EHR archive. Implementing would invent PHI storage, taxonomy, lifecycle, and access audit.

| Field | Finding |
|-------|---------|
| Actor | Clinical staff |
| Existing route | None |
| Existing backend | None (CMS media ≠ clinical) |
| Can implement without new backend | **NO** |
| Product decisions still open | Storage adapter vs blob store; categories; lifecycle; scoping |
| Security | New PHI keys + download/view audit required |

**Do not:** placeholder document library, overload website media, fake uploads.

---

## ACN27 — Locations Management

**Stitch:** Desktop `81baf40c090843b5a9ac22d0c40919e4` · Mobile `e43a1cea620e4a859f449276f5c763b7`  
**Freeze:** `DEFERRED_PRODUCT_BACKEND`  
**vs B2-10:** `FACILITY_ALTERNATE_WORKSPACE` (room inventory) — **not** a facilities detail/edit leaf

### Why outside safe V2.03 scope

Stitch shows exam rooms, cath suites, wards, location codes, equipment, Active/Maintenance. Canonical B2-10 `/app/facilities` is an **organization facility-site catalogue** (+ separate departments). Presenting rooms as facilities is contradictory. Room schema does not exist.

| Field | Finding |
|-------|---------|
| Actor | Ops / facility admin |
| Existing route | `/app/facilities` (B2-10 sites — different domain) |
| Existing backend | Facilities + departments — **no room inventory** |
| Can implement without new backend | **NO** |
| Product decisions still open | New room model vs defer vs Stitch redesign |
| Must not | Replace or fork `/app/facilities`; modify B2-10 to force fit |

**Do not:** placeholder rooms UI over facility rows.

---

## AC-P05 — Visit Summaries

**Stitch:** Desktop `24ad0b96c4ca4d709b78e1121dd5015f` · Mobile `ee5e5577e3e04e52bf4b9173eb191c78`  
**Freeze:** `DEFERRED_PRODUCT_SECURITY`

### Why outside safe V2.03 scope

Patient portal past-care summaries (diagnosis, vitals, meds, care plan, PDF). Staff encounters/signed notes exist but **no** patient-safe release/projector, publish table, or portal routes. Auto-exposing chart notes would be a PHI leak.

| Field | Finding |
|-------|---------|
| Actor | Patient portal user |
| Existing route | None |
| Existing backend | Staff clinical truth only — not patient-visible |
| Can implement without new backend | **NO** |
| Product decisions still open | Who releases; field contract; PDF/messaging |
| Security | Explicit patient-visible PHI model + ownership isolation required |

**Do not:** thin portal UI over raw `consultation_notes`, fake “summaries” from bookings alone.

---

## Decision checklist (post–V2.03 / future)

### ACN18

- [ ] Storage: platform media adapter **or** dedicated clinical blob store?
- [ ] In-scope categories + lifecycle?
- [ ] RBAC key names + role matrix?

### ACN27

- [ ] Introduce room/location domain **or** permanently defer Stitch rooms?
- [ ] Confirm B2-10 remains sole facilities catalogue owner?

### AC-P05

- [ ] Release trigger: auto vs clinician publish?
- [ ] Patient-visible field contract + exclusions?
- [ ] Authz + audit requirements signed off?

Until checked, keep all three **DEFERRED**.

---

## Related docs

| Doc | Role |
|-----|------|
| `docs/qa/V2_03_BATCH3_FINAL_PARITY_AUDIT.md` | Final parity + freeze verdict |
| `docs/v2.03/ACTIVECLINIC_BATCH3_COLLISION_SCREENS.md` | ACN27 / AC-P06 collision gate |
| `docs/v2.03/ACTIVECLINIC_BATCH3_PREIMPLEMENTATION_ANALYSIS.md` | Per-screen A–J lenses |
| `docs/qa/V2_03_BATCH3_MORNING_RECONCILIATION.md` | Morning recon |

---

**Markers:**  
`V2_03_BATCH3_DECISION_GATE_COMPLETE` (historical ACN18/AC-P05 gate)  
`V2_03_BATCH3_FINAL_PARITY_PASS` (scope freeze + parity)
