# ActiveClinic V2.03 Batch 3 — ACN17 + ACN19 Leaf Pass

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_ACN17_ACN19_PASS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Baseline RC** | `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` |
| **Stitch project** | `3741389873539108242` |
| **Verdict** | `V2_03_BATCH3_ACN17_ACN19_PASS` |

---

## Ownership (reused — not recreated)

| Screen | Route | View | Loader / service | RBAC |
|--------|-------|------|------------------|------|
| **ACN17** Vitals & Observations | `GET/POST /app/clinical/encounter/:encounterId/vitals` | `vital-signs-entry-content.ejs` | `loadActiveClinicVitalSignsEntryScreen` → `recordVitalSignObservation` / `listVitalSignsForEncounter` | `activeclinic.triage.record` + dept `clinical` |
| **ACN19** Prescription Editor | `GET/POST /app/clinical/encounter/:encounterId/order/prescription` | `create-prescription-content.ejs` | `loadActiveClinicOrderFormScreen` → `createClinicalOrder` | `activeclinic.clinical_order.create` + dept `clinical` |

**Frozen / untouched:** B2-06 `consultation-workspace-content.ejs`, `ac-app-tokens.css`, navigation architecture, gp-ops core, patients/appointment detail/billing/facilities workspaces.

**Cache bump only:** `SHELL_ASSET_VERSION` → `v2-03-b3-acn17-19-01` (delivers `ac-app.css` leaf pack).

---

## Stitch references

| Code | Desktop | Mobile |
|------|---------|--------|
| ACN17 | `e4dc47dcc41a411184e987308aedc943` | `c8552b6186d4428283b31d7b875005d6` |
| ACN19 | `47c5eb28d5e1482e9dd0c2f2cbee7b59` | `5e5048f347414e53af6e8a86aa83fba7` |

---

## Intentional omissions (no schema invented)

- ACN17: multi-vital batch commit, pain score as vitals type, pulse-ox double-check, trend/sparkline widgets, auto BMI calculation
- ACN19: medication catalogue search, multi-line draft cards, CDS / allergy interaction engine, EPCS, e-prescribe destination UI

Optional JSON fields (`route`, `quantity`, `refills`) stored in existing `clinical_orders.order_details` JSONB without migration.

---

## Tests

- `tests/activeclinic-batch3-acn17-acn19.test.js` — markers, responsive hooks, RBAC deny receptionist, POST vitals + prescription, B2-06 marker intact
- Updated `tests/activeclinic-clinical-ui-parity.test.js` stitch IDs for the two leaf views

---

## Production / deploy

**Not pushed. Not deployed. Production untouched.**
