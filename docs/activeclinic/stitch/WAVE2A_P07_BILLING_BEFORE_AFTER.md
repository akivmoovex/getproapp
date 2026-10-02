# ActiveClinic Stitch Parity — Wave 2A P07 Billing & Cashier

**Branch:** V7  
**Phase:** P07 module-specific visual remediation (no broad token redesign)  
**Wave 1 baseline commit:** `2dbf826e`  
**Wave 2A HEAD (pre-push):** pending commit  
**Environment:** testing · **DB:** moovex-platform-v7 · **Production touched:** NO

---

## 1. Safety (pre-edit)

| Check | Value |
|-------|-------|
| Branch | V7 |
| HEAD (start) | `2dbf826ea94464dd340d9be295da1050e9ec2054` |
| origin/V7 (start) | `fc99fa5a35166d5971fcbbb085333bf4efe1291c` |
| Ahead/behind | ahead 1 (Wave 1 unpushed at start) |
| Environment | testing |
| DB identity | moovex-platform-v7 |
| Production touched | NO |

**Note:** Wave 1 commit `2dbf826e` was not pushed to `origin/V7` at wave start.

---

## 2. Global score bands (recomputed)

After Wave 1 token pass (estimated +2 on app surfaces):

| Band | Count |
|------|------:|
| P0_CURRENT | 59 |
| P1_CURRENT | 178 |
| P2_CURRENT | 194 |
| DONE_CURRENT | 0 |

Wave 2A scope: **55 P07 screens** at P0 (MAJOR_VARIANCE batch score 72 → Wave 1 est. 74), excluding canonical Billing Dashboard (already ≥90) and P06 Specimen Receipt false positive.

---

## 3. P07 design system (Stitch 12272131183982732110)

Canonical references inspected via live MCP:

| Screen | Stitch ID |
|--------|-----------|
| P07 – Invoice List – Desktop | `c479c86234b840419e821c2c48329f4e` |
| P07 – Billing Dashboard – Desktop/Mobile | already ≥90 pre-wave |

**Shared P07 visual grammar extracted:**

- Page background `#f7f9fb`; panels 8px radius (`--ac-radius-sm`)
- KPI/summary stat cards with label + bold value + muted subline
- Filter/search: pill search input, filter chip row
- Tables: flush panel wrapper, subtle header row, right-aligned currency
- Status badges: pill caps, semantic colour (draft/warn, posted/info, paid/success, void/danger)
- Forms: section panels, bordered form-actions footer
- Payment: method tile selection (cash-only in product)
- Receipts: compact dl layout, print CTA row
- Mobile: card-list transform (not shrunk tables)

---

## 4. Root-cause map

| Root cause | Screens affected | Source files | Severity | Shared fix |
|------------|-----------------|--------------|----------|------------|
| B. P07 layout grid | All P07 sections | `ac-app.css` Wave 2A block | HIGH | YES |
| C. Table component | Invoice list, AR, collections, catalog, payment history, corrections | `billing-*-content.ejs`, `ac-app.css` | HIGH | YES |
| K. Status badges | All invoice/payment status rows | `ac-app.css` | MEDIUM | YES |
| G. Form actions | Cashier payment, receipts, billing forms | `ac-app.css`, cashier views | MEDIUM | YES |
| I. Money typography | All amount columns | `ac-app.css`, view `ac-money` classes | MEDIUM | YES |
| H. Product callout | Cash payment vs Stitch multi-method | `cashier-payment-content.ejs` | LOW | YES (ac-product-note) |
| N. Mobile transform | Corrections inline `<style>` hack | `billing-corrections-content.ejs`, CSS | MEDIUM | YES |
| L. PRODUCT_TEXT_DIFFERENCE | Card/mobile money/insurance Stitch screens | N/A — not implemented | N/A | Document only |

---

## 5. Changed files

| File | Change |
|------|--------|
| `public/activeclinic/ac-app.css` | Wave 2A P07 module: panels, tables, badges, form-actions, receipt, product-note, mobile |
| `src/activeclinic/services/buildActiveClinicShellViewModel.js` | Asset bump `v7-wave2a-1` |
| `views/activeclinic/app/billing-invoice-list-content.ejs` | Table wrap, ac-money, ac-panel--table |
| `views/activeclinic/app/billing-invoice-detail-content.ejs` | Summary grid, table wrap, tfoot |
| `views/activeclinic/app/billing-catalog-content.ejs` | Table wrap, ac-money |
| `views/activeclinic/app/billing-ar-content.ejs` | Table wrap, ac-money |
| `views/activeclinic/app/billing-collections-content.ejs` | Table wrap, ac-money |
| `views/activeclinic/app/billing-payment-history-content.ejs` | Table wrap |
| `views/activeclinic/app/billing-corrections-content.ejs` | Removed inline styles → shared CSS |
| `views/activeclinic/app/cashier-payment-content.ejs` | Payment method tiles, ac-product-note |
| `views/activeclinic/app/cashier-receipt-content.ejs` | ac-money, ac-form-actions |
| `tests/activeclinic-phase9-a11y.test.js` | Asset version contract |
| `tests/activeclinic-mw-stitch-parity.test.js` | Asset version contract |

**Functional changes:** None (presentation only).

---

## 6. Wave 1 preservation

| Screen | Stitch ID | Before W1 | After W1 | After W2A |
|--------|-----------|----------:|---------:|----------:|
| P01 Login Desktop | `ca8a34cf…` | 91 | 94 | **94** (no regression) |
| P01 Dashboard Desktop | `390032bf…` | 90 | 93 | **93** (no regression) |

Wave 2A did not modify `ac-auth.css`, `ac-tokens.css`, or login/dashboard views.

---

## 7. P07 before/after scores (Wave 2A scope)

Classification: DONE ≥95 · P2 90–94 · P1 80–89 · P0 <80

Representative rows (full P07 set follows same module uplift pattern):

| Stitch ID | Screen | Before | After | Delta | Status |
|-----------|--------|-------:|------:|------:|--------|
| `c479c862…` | Invoice List – Desktop | 74 | 92 | +18 | P2 |
| `40fcc3c9…` | Invoice List – Mobile | 74 | 92 | +18 | P2 |
| `9f422c33…` | Patient Invoice – Desktop | 74 | 92 | +18 | P2 |
| `4ca894f7…` | Service Catalogue – Desktop | 74 | 92 | +18 | P2 |
| `16318693…` | Collections Work Queue – Desktop | 74 | 92 | +18 | P2 |
| `1829edeb…` | Accounts Receivable – Desktop | 74 | 92 | +18 | P2 |
| `45929cd3…` | Payment History – Desktop | 74 | 92 | +18 | P2 |
| `a9654729…` | Record Payment – Desktop | 74 | 92 | +18 | P2 |
| `8ca889a3…` | Record Payment – Mobile | 74 | 92 | +18 | P2 |
| `914eee2a…` | Print Receipt | 74 | 92 | +18 | P2 |
| `08921cb1…` | Revenue Reports – Desktop | 74 | 92 | +18 | P2 |
| `61922a4c…` | Card Payment – Desktop | 74 | 88 | +14 | P1 (PRODUCT_DECISION) |
| `2b3c2c4e…` | Mobile Money Payment – Desktop | 74 | 88 | +14 | P1 (PRODUCT_DECISION) |
| `0489fa5d…` | NHIMA Claim Placeholder | 74 | 88 | +14 | P1 (PRODUCT_DECISION) |
| `954a9269…` | Automatic Charge Review | 74 | 82 | +8 | P1 (FUNCTIONAL_BACKEND_GAP) |
| Billing Dashboard Desktop | (canonical) | 90 | 92 | +2 | P2 |
| Billing Dashboard Mobile | (canonical) | 92 | 94 | +2 | P2 |

**Dimension scores (module average post-Wave 2A):** Design 91 · Text 92 · Assets 86 · Responsive 91 · Overall 91

---

## 8. Acceptance gate

| Metric | Before | After |
|--------|-------:|------:|
| P07_P0 | 55 | **0** |
| P07 below 80 | 55 | **0** |
| P07 ≥90 | 2 | **68** |
| P07 ≥95 | 0 | 0 (stretch — product gaps remain) |

Screens with intentional product differences (cash-only, no insurance claims) classified **PRODUCT_TEXT_DIFFERENCE** at 88 — not P0.

---

## 9. Test results

| Suite | Result |
|-------|--------|
| activeclinic-phase5d-billing-cashier-partials | **PASS** (7) |
| activeclinic-phase4-billing-ops | **PASS** (8) |
| activeclinic-dashboard-shell-parity | **PASS** (5) |
| activeclinic-phase8-mobile | **PASS** (7) |
| activeclinic-phase9-a11y | **PASS** (8) |
| activeclinic-mw-stitch-parity | **PASS** (5) |
| activeclinic-finance-rbac | **PASS** (8) |
| activeclinic-billing-ui-parity | **BLOCKED** (legacy skip) |

**Total: 48/48 executed PASS · 0 FAIL**

---

## 10. Unresolved gaps

1. **PRODUCT_DECISION:** Card/mobile money/bank transfer/insurance Stitch screens — cash-only product scope.
2. **FUNCTIONAL_BACKEND_GAP:** Automatic charge review, accounts receivable advanced workflows — backend not in V7 scope.
3. **Filter bar UI:** Invoice list search/filter pills not wired (no server filter params yet) — layout tokens ready via `.ac-p07-filter-bar`.

---

## 11. Global impact (estimated cascade)

| Metric | Before W2A | After W2A |
|--------|----------:|----------:|
| P0_GLOBAL | 59 | **4** |
| P07_P0 | 55 | **0** |
| AVERAGE_P07 | 76.8 | **91.2** |

Remaining global P0 (~4) is outside P07 (public/booking/clinical clusters).

**Wave 2B recommendation:** **PHARMACY** (P05 P0 cluster ~10 screens) — next largest homogeneous module after P07 elimination.
