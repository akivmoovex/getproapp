# ActiveClinic V2.03 Batch 3 — Collision-Gated Screens (ACN27 + AC-P06)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_COLLISION_SCREENS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Stitch project** | `3741389873539108242` |
| **Overall verdict** | `V2_03_BATCH3_COLLISION_SCREENS_PARTIAL` |

---

## A. ACN27 — Locations Management

| Field | Value |
|-------|--------|
| **Stitch** | Desktop `81baf40c090843b5a9ac22d0c40919e4` · Mobile `e43a1cea620e4a859f449276f5c763b7` |
| **Frozen owner** | AC-B2-10 `/app/facilities` + departments settings |
| **Classification** | **MISSING_FUNCTION** (room/location inventory) relative to B2-10 facility-site model; presenting Stitch rooms as facilities would be **CONTRADICTORY_DESIGN** |
| **Verdict** | **BLOCKED** |

### Why blocked

Stitch ACN27 shows a **room/location hierarchy** (Exam Room 302A, cath suites, wards, labs, location codes, equipment, Active/Maintenance) under Facilities & Departments.

Canonical B2-10 (`facilities-list-content.ejs`, `data-ac-stitch="AC-B2-10"`) is an **organization facility catalogue** (sites) with departments configured separately — not a room inventory.

Implementing ACN27 as designed would require:
- new location/room schema, **or**
- replacing/forking `/app/facilities` IA

Neither is allowed under collision rules (B2-10 remains canonical; no competing facilities module; no new DB without unavoidable evidence for a room domain that does not exist).

**Not implemented.** No facilities/shell/nav/token changes for ACN27.

---

## B. AC-P06 — Patient Portal Invoices & Receipts

| Field | Value |
|-------|--------|
| **Stitch** | Desktop `a493b33db83c4873ab2964391ee088b9` · Mobile `5b381b193b6643d09cbc317b55fd5f32` |
| **Collision** | ACN21–23 / AC-B2-09 staff billing + cashier SoD |
| **Classification** | Separate **portal presentation layer** over existing `invoices` / `receipts` / `payments` (patient-owned read) |
| **Verdict** | **PASS** |

### Safe additive implementation

| Piece | Choice |
|-------|--------|
| Route | `GET /clinics/:clinicKey/patient/invoices` |
| Service | `activeClinicPatientPortalBillingService.js` — patient_id + tenant ownership; **no** staff billing RBAC |
| View | New `patient/invoices.ejs` — **never** mounts staff `billing-*-content.ejs` |
| Money | `formatMoney` |
| Mutations | **None** — no Pay Now, no cashier session, no `recordPayment` |
| SoD | Staff B2-09 / cashier routes untouched; portal session denied from `/app/billing` |

### Intentional omissions

Pay Now, insurance adjudication, saved cards/auto-pay, claim numbers, PDF/export, staff Collect payment controls.

### Cache

Portal `ASSET_VERSION` → `v2-03-b3-acp06-01`.

---

## Tests

- `tests/activeclinic-batch3-acp06.test.js`
- Facilities regression: `tests/activeclinic-batch2-facilities.test.js` (unchanged by ACN27 block)
- Billing regression: `tests/activeclinic-batch2-billing.test.js`

---

## Production / deploy

**Not pushed. Not deployed.**
