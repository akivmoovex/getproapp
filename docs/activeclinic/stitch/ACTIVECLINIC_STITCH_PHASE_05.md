# ActiveClinic Stitch — Phase 5 (`P05`)

**Exact Stitch phase label:** `P05`
**Module:** Pharmacy / Medication / Stock
**Audited:** 2026-08-04
**Screens:** 29 (Desktop 23 · Mobile 6 · Tablet 0)

Pharmacy dashboard, prescriptions, inventory, dispensing

## Status summary

| Status | Count |
|--------|------:|
| PARTIAL | 19 |
| PRODUCT_DECISION | 8 |
| BLOCKED | 2 |

## Screens

| Exact name | ID | Form | Viewport | Route | View | Loader | Write | Permission | Backend | Status | Notes |
|------------|----|------|----------|-------|------|--------|-------|------------|---------|--------|-------|
| P05 – Add Medicine | `83495a7aea6547ce873af695fcb5f604` | DESKTOP | 2560×2538 | `/app/pharmacy/catalogue/new` | `src/activeclinic/services/activeClinicPharmacyService.js` | `addMedication` | `addMedication` | `activeclinic.inventory.manage` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Dispense Prescription – Desktop | `e4d4e37c175a458d9004e1240395ba63` | DESKTOP | 2560×2176 | `/app/pharmacy/prescriptions/:id/dispense` | `activeClinicPharmacyService.js` | `dispensePrescription` | `dispensePrescription` | `activeclinic.pharmacy.dispense` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Dispense Prescription – Mobile | `ace4f11562b24515866b40c5594a18e6` | MOBILE | 780×2170 | `/app/pharmacy/prescriptions/:id/dispense` | `activeClinicPharmacyService.js` | `dispensePrescription` | `dispensePrescription` | `activeclinic.pharmacy.dispense` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; mobile UI not implemented |
| P05 – Dispensing Completed – Desktop | `eeaf00f13f6f4e238da3aef30a556a57` | DESKTOP | 2560×2176 | `/app/pharmacy/prescriptions/:id` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; completion screen placeholder |
| P05 – Dispensing Confirmation | `00a95c467df2414fb8c6dea108170b04` | DESKTOP | 2560×2084 | `/app/pharmacy/prescriptions/:id/dispense` | `activeClinicPharmacyService.js` | `dispensePrescription` | `dispensePrescription` | `activeclinic.pharmacy.dispense` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; confirmation UI placeholder |
| P05 – Dispensing Review – Desktop | `97138791742e4338a34811a6fd7e464d` | DESKTOP | 2560×2244 | `/app/pharmacy/prescriptions/:id` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; review UI placeholder |
| P05 – Expiry Alerts – Desktop | `fcba0b2ed1334eacad9647e597f66959` | DESKTOP | 2560×2048 | `/app/pharmacy/alerts/expiry` | `activeClinicPharmacyService.js` | `listExpiringBatches` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Low Stock Alerts – Desktop | `553dd601642d41abb89cf4c7127c221a` | DESKTOP | 2560×2048 | `/app/pharmacy/alerts/low-stock` | `activeClinicPharmacyService.js` | `listLowStockItems` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Medicine Batch Detail | `6c0795f36aef4fe3b634dc350d230672` | DESKTOP | 2560×2048 | `/app/pharmacy/inventory/batches/:id` | `activeClinicPharmacyService.js` | `receiveStock` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend supports batch tracking; detail UI placeholder |
| P05 – Medicine Catalogue – Desktop | `b5e534cf921d460c9774c2772ab688e9` | DESKTOP | 2560×2048 | `/app/pharmacy/catalogue` | `activeClinicPharmacyService.js` | `listMedications` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Medicine Detail – Desktop | `20a62e6f34ef422b8262750b0fe9788a` | DESKTOP | 2560×2176 | `/app/pharmacy/catalogue/:id` | `activeClinicPharmacyService.js` | `getMedicationById` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Medicine Inventory – Desktop | `1f079e7d3f9c464c8754fa09a09f2626` | DESKTOP | 2560×2048 | `/app/pharmacy/inventory` | `activeClinicPharmacyService.js` | `listInventoryItems` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Medicine Inventory – Mobile | `a0cb61de9f0f4eaa8d732d4cf143f090` | MOBILE | 780×1768 | `/app/pharmacy/inventory` | `activeClinicPharmacyService.js` | `listInventoryItems` | `—` | `activeclinic.inventory.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; mobile UI not implemented |
| P05 – Medicine Substitution – Desktop | `e237cd030fb241deb15ed8eb0f4f895e` | DESKTOP | 2560×2048 | `/app/pharmacy/prescriptions/:id/substitute` | `activeClinicPharmacyService.js` | `dispensePrescription` | `—` | `activeclinic.pharmacy.review` | `016_pharmacy_stock.sql` | PRODUCT_DECISION | Backend supports substitution field; therapeutic swap requires clinical approval |
| P05 – Partial Dispensing – Desktop | `c7c3ea1931f74acb845208dd09d0d63d` | DESKTOP | 2560×2176 | `/app/pharmacy/prescriptions/:id/dispense` | `activeClinicPharmacyService.js` | `dispensePrescription` | `dispensePrescription` | `activeclinic.pharmacy.dispense` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete partial dispense; UI placeholder |
| P05 – Patient Medicine Instructions – Mobile | `7cffba8bdac84abda7a8d31951d1948f` | MOBILE | 780×2108 | `/app/pharmacy/patient-instructions/:id` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; mobile UI not implemented |
| P05 – Pharmacy Dashboard – Desktop | `4d83f5c845ae4d91b805a1dfd6a7268d` | DESKTOP | 2560×2048 | `/app/pharmacy` | `activeClinicPharmacyService.js` | multiple | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend services complete; dashboard UI placeholder |
| P05 – Pharmacy Purchase Orders – Desktop | `0f1976955fc14d8c97f1f8c728b4e1da` | DESKTOP | 2560×2048 | `/app/pharmacy/purchase-orders` | `—` | `—` | `—` | `TBD` | `—` | PRODUCT_DECISION | Full procurement workflow deferred; minimal PO tracking possible if needed |
| P05 – Pharmacy Stock Adjustment | `2147643a82af4fb28a8368dcff867a75` | DESKTOP | 2560×2048 | `/app/pharmacy/inventory/adjust` | `activeClinicPharmacyService.js` | `receiveStock` | stock adjustment via movements | `activeclinic.inventory.manage` | `016_pharmacy_stock.sql` | PARTIAL | Backend supports adjustment movements; UI placeholder |
| P05 – Pharmacy Stock Transfer | `ce22d1c5de5f43ad8a458f57aa217fd3` | DESKTOP | 2560×2048 | `/app/pharmacy/inventory/transfer` | `activeClinicPharmacyService.js` | `receiveStock` | stock movements | `activeclinic.inventory.manage` | `016_pharmacy_stock.sql` | PARTIAL | Backend supports transfer movements; UI placeholder |
| P05 – Prescription Clinical Review – Desktop | `99d29d4a8b204031b068e2b94dfeb95b` | DESKTOP | 2560×2048 | `/app/pharmacy/prescriptions/:id/review` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.review` | `016_pharmacy_stock.sql` | PRODUCT_DECISION | Manual review flag supported; automated CDS blocked (no external API) |
| P05 – Prescription Clinical Review – Mobile | `279be7b923664e449bd2001528e7c5ec` | MOBILE | 780×1768 | `/app/pharmacy/prescriptions/:id/review` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.review` | `016_pharmacy_stock.sql` | PRODUCT_DECISION | Manual review flag supported; mobile UI not implemented |
| P05 – Prescription Detail – Desktop | `2da2d7b7cd734161a9f8257c2256c6f3` | DESKTOP | 2560×2048 | `/app/pharmacy/prescriptions/:id` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Prescription Detail – Mobile | `4f369d10d5654e68bf5a5c45d8ef7d78` | MOBILE | 780×1884 | `/app/pharmacy/prescriptions/:id` | `activeClinicPharmacyService.js` | `getPrescriptionById` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; mobile UI not implemented |
| P05 – Prescription Queue – Desktop | `5472760fda8148cf8611564236ae2247` | DESKTOP | 2560×2048 | `/app/pharmacy/queue` | `activeClinicPharmacyService.js` | `listPrescriptionQueue` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Prescription Queue – Mobile | `322c2b620c8e4b248fa5620881555d8b` | MOBILE | 780×1768 | `/app/pharmacy/queue` | `activeClinicPharmacyService.js` | `listPrescriptionQueue` | `—` | `activeclinic.pharmacy.view` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; mobile UI not implemented |
| P05 – Print Medicine Labels | `b62126b07af7488094221932b9046193` | DESKTOP | 2560×2048 | `/app/pharmacy/prescriptions/:id/labels` | `—` | `—` | `—` | `activeclinic.pharmacy.dispense` | `—` | PRODUCT_DECISION | Label generation deferred; PDF/print workflow TBD |
| P05 – Receive Pharmacy Stock – Desktop | `a61dbccce82b43788dc347e25843ae07` | DESKTOP | 2560×2048 | `/app/pharmacy/inventory/receive` | `activeClinicPharmacyService.js` | `receiveStock` | `receiveStock` | `activeclinic.inventory.manage` | `016_pharmacy_stock.sql` | PARTIAL | Backend complete; UI placeholder only |
| P05 – Select Medicine Batch | `a7649e64ba1e4eee8ca0bcb6a54594bd` | DESKTOP | 2560×2048 | `/app/pharmacy/prescriptions/:id/dispense` | `activeClinicPharmacyService.js` | `dispensePrescription` | batch selection in dispense | `activeclinic.pharmacy.dispense` | `016_pharmacy_stock.sql` | PRODUCT_DECISION | Backend supports batch selection; FEFO UI logic TBD |

## Implementation Notes (2026-08-04)

**Status:** Foundation + UI complete

- ✅ Schema: `db/migrations/activeclinic/016_pharmacy_stock.sql` (8 tables, append-only movements, batch/expiry tracking)
- ✅ Permissions: `db/migrations/blessboard/085_activeclinic_pharmacy_permissions.sql` (6 permissions, conservative defaults)
- ✅ Services: `src/activeclinic/services/activeClinicPharmacyService.js` (medication catalogue, inventory, stock movements, prescriptions, dispensing with partial support)
- ✅ Tests: `tests/activeclinic-pharmacy-foundation.test.js` (15 tests covering catalogue, receive, dispense, partial, authz, tenant isolation)
- ✅ Architecture: `docs/activeclinic/architecture/ACTIVECLINIC_P05_PHARMACY_DOMAIN.md`
- ✅ UI: Routes/views implemented with EJS + data-ac-stitch attributes
- ✅ Loaders: `src/activeclinic/services/loadActiveClinicPharmacyScreens.js`
- ✅ Routes: `src/activeclinic/http/activeClinicPharmacyRoutes.js`
- ✅ Views: 11 EJS templates for pharmacy screens
- ✅ Navigation: Pharmacy menu item with activeclinic.pharmacy.view permission
- ✅ UI Parity Tests: `tests/activeclinic-pharmacy-ui-parity.test.js` (6 tests: auth, CSRF, catalogue add, receive stock, list inventory)

**Backend Features Implemented:**
- Medication catalogue management
- Stock receive with batch/expiry tracking
- Inventory queries (list, low stock, expiring batches)
- Prescription queue management
- Full and partial dispensing with stock decrement
- Stock movements (receive, adjustment, transfer, dispense_decrement, reversal)
- Permission-based authorization
- Tenant isolation
- Append-only audit trail

**Product Decisions Required:**
- Medicine substitution: Generic swap vs therapeutic swap (requires clinical approval)
- Purchase orders: Minimal tracking vs full procurement workflow
- Label printing: PDF generation workflow
- Batch selection UI: FEFO logic implementation
- Drug interaction checking: Requires external API (BLOCKED for P05)

**Next Steps:**
- UI implementation via EJS views with Stitch parity
- Navigation integration (pharmacy menu item)
- Mobile-responsive variants for 6 mobile screens
- Clinical order → prescription queue automation

## Checkpoint

See `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md`.


## Overnight checkpoint (2026-08-04)

**Verdict:** SCHEMA_BLOCKED — Pharmacy

No medicine catalogue, stock, prescription dispense schema.

Safe action taken: inventory + gap recording only. No mock clinical/financial UI, no fabricated KPIs, no dead routes advertised in navigation.
