# ActiveClinic V7 — Phase 15 implementation cleanup

Remove duplication and consolidate Phase 4–14 code **without changing behavior**. No UI redesign.

No push. No deploy. Production untouched. **No migrations.**

## Verdict

| Check | Result |
|---|---|
| Behavior changes | **none** |
| Duplication removed | Shared renderer, finance IDs, invoice lock, booking status, pharmacy HTTP helpers, CSRF/error partials, CSS radius |
| Product files deleted | **0** |
| Net new files | **+2** partials (`ac-csrf-field.ejs`, `ac-form-error.ejs`) |
| Uncertain dead code deleted | **0** |
| node:test (excl. 2 Mocha leftovers) | **475 pass / 0 fail / 0 skip** |
| Push / deploy | no / no |

## Safety

| | |
|---|---|
| Branch | V7 |
| HEAD | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Push | no |
| Deploy | no |
| Stitch (public / booking / portal) | `17813606734422395399` |
| Stitch (internal ops) | `12272131183982732110` |

## 1. Duplication removed

### Routes

| Before | After |
|---|---|
| `issuePageCsrf` + `renderShell` copied in billing, pharmacy, cashier | `createActiveClinicAppRenderer` in `renderActiveClinicShell.js` |
| Pharmacy POST CSRF 403 HTML × 9 | `rejectPharmacyCsrf` |
| Pharmacy UUID 404 HTML × ~12 | `pharmacyNotFound` |
| Billing `billingIds(auth, facility)` wrapping `financeIdsFromAuth` | `financeIdsWithFacility` in `activeClinicFinanceAuthz.js` |

`input.assetVersion` on the shell view-model was already ignored (`SHELL_ASSET_VERSION` wins). Billing/pharmacy/cashier no longer pass a dead `p05-1` / similar override.

### Services

| Before | After |
|---|---|
| Invoice remaining-lock SQL in `lockInvoiceRemaining` **and** `createCreditNote` | Credit notes call exported `lockInvoiceRemaining`; extra patient/posted/cap checks stay in ops |
| Public booking mutable-status `includes([...])` in lookup + patient portal | `canModifyBookingStatus` / `MUTABLE_PUBLIC_BOOKING_STATUSES` in `activeClinicPublicBookingDraft.js` |

SQL `IN ('submitted_pending_confirmation', 'confirmed')` left as literals (same values). Unifying CSRF 403 text (billing) with pharmacy HTML CSRF was skipped — different response bodies.

### Templates

New partials, same markup:

- `views/activeclinic/partials/ac-csrf-field.ejs`
- `views/activeclinic/partials/ac-form-error.ejs`

Wired into pharmacy ops forms and Phase 4 billing/cashier forms (31 templates). Custom error copy (e.g. invoice add-item) was left inline.

### CSS

Removed the dashboard-only `border-radius: 0.5rem` block that duplicated Phase 7C panel/stat-card rules. Phase 7C chrome now uses `var(--ac-radius-sm)` (8px) and `var(--ac-surface)` under `body.ac-app-body`. Shell assets bumped **`v7-parity-13` → `v7-parity-15`**. Public/patient/auth stay at `v7-parity-13`.

## 2. Dead code

### Deleted (certain)

| Item | Where |
|---|---|
| Unused `actor()` / `actorFromAuth` | Pharmacy routes + `loadActiveClinicPharmacyScreens.js` |
| Unused `CODE_ACTIVECLINIC_ORG_V6` / `getPlatformDeploymentCode` | Pharmacy routes |
| Unused payment/refund/reversal/`createPatientCharge`/`PAYMENT_METHOD` imports | Billing routes (cashier owns those calls) |

### Found, not deleted (uncertain or still mapped)

| Item | Why kept |
|---|---|
| `views/activeclinic/app/cashier-close-content.ejs` | GET `/app/cashier/close` redirects to `/app/cashier/close/cash-count`. View is still listed in Stitch/inventory maps. Phase 16. |
| Local `issuePageCsrf` in ~16 other route files | Not Phase 4–14 overnight focus; public/portal signatures differ |
| Ignored `assetVersion` in appointment/clinical/diagnostics/reception | Harmless until those files use the shared renderer |
| Mocha `billing-ui-parity` / `diagnostics-ui-parity` | Pre-existing runner mismatch (Phase 11) |

No orphan **routes** deleted. No speculative UUID/`hasPerm` framework.

## 3. Tests

Sweep: `node --test --test-concurrency=1` on `tests/activeclinic-*.test.js` excluding the two Mocha leftovers.

| | Count |
|---|---|
| Files | 74 |
| Pass | **475** |
| Fail | **0** (after two stale-assertion updates) |
| Skip | 0 |

First-run failures (not product regressions):

| ID | Test | Cause | Action |
|---|---|---|---|
| P15-T1 | pharmacy-ui-parity receive stock expected 303, got 400 | Fixture `expiryDate: 2025-12-31` is past as of 2026-08-12; Phase 13 already rejects expired receive | Future date `2027-12-31` |
| P15-T2 | phase9-a11y shell asset `/v7-parity-13/` | Intentional cache-bust to `v7-parity-15` | Assert `v7-parity-15` on shell VM only |

Mocha leftovers **not executed** (same as Phase 11): `activeclinic-billing-ui-parity.test.js`, `activeclinic-diagnostics-ui-parity.test.js`.

Focused suites also green: phase13 domain, phase14 RBAC, phase4 pharmacy/billing ops, finance SoD, public booking, patient portal, phase5c/5d partials, pharmacy foundation.

## 4. Remaining duplication (left on purpose)

- Shared renderer not rolled to staff/settings/clinical/diagnostics/reception/appointments/patients
- Local `UUID_RE` copies
- CSRF hidden inputs on settings, staff, diagnostics, public booking (different locals: `csrfField` vs `shell.csrf`)
- Billing POST CSRF still returns `403 Forbidden` text; pharmacy returns HTML `renderSimpleState`

## Next

PHASE 16 — final inventory/mapping integrity (`cashier-close-content.ejs` mapping vs redirect).
