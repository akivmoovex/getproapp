# ActiveClinic V7 — Phase 8 mobile report

Full mobile Stitch parity + usability audit. **151** mapped MOBILE screens considered. **P0 mobile usability blockers = 0.**

No push. No deploy. Production untouched.

## Inventory

| Source | Mobile screens |
|---|---:|
| Public / booking / portal `17813606734422395399` | 107 |
| Internal ops `12272131183982732110` | 44 |
| **Mapped MOBILE total** | **151** |

Coverage: 136 full · 0 missing · 15 other (4 product-decision + 7 no-implementation-required + 4 duplicate). Other rows were recorded, not faked.

Widths audited: **360 / 375 / 390 / 430 / 768**.

## Issues

| | Count |
|---|---:|
| Issues before (confirmed P0/P1 usability) | 9 |
| Issues fixed | 9 |
| P0 mobile usability blockers after | **0** |
| Remaining (non-P0 / honesty / visual MATCHED) | 4 notes |

### Fixed

- **NAV_BROKEN** — platform bottom nav now shows on register/onboarding.
- **HORIZONTAL_OVERFLOW / FORM_DENSITY** — PhoneField stays one row at 360; country picker `min-width:12rem` removed.
- **MODAL_OVERFLOW** — country list is a full-bleed bottom sheet with backdrop and body lock ≤430px; long names wrap.
- **TABLE_UNUSABLE** — diagnostics, pharmacy, billing lists, clinical alerts, missed appointments, call board, departments → mobile cards; desktop tables hide ≤899px.
- **KEYBOARD_OBSTRUCTION** — sticky booking CTA and phone sheet lift with `visualViewport` (`--ac-keyboard-inset`).
- **SAFE_AREA** — `viewport-fit=cover` on public, patient, auth, and app shells.
- **TAP_TARGET_SMALL** — search, filter tabs, and controls ≥44px on phone widths.
- **TEXT_CLIPPING** — public/tenant `h1` no longer capped at 18ch.

### Remaining (not P0 blockers)

- Visual **MATCHED ≥95** still needs live browser ↔ Stitch evidence.
- Honesty shells (offline, recovery, unavailable, unpublished slots) stay product-honest vs full Stitch chrome.
- Secondary **detail** tables (invoice lines, some reports) still scroll horizontally.
- 4 product-decision + 7 no-implementation mobile rows left as mapped.

## PhoneField

Country selector, search, flags (ISO2), calling code, long names, keyboard, focus, validation, and bottom sheet were audited. Sheet + wrap + 360 row + keyboard inset are in `ac-phone-field.css` / `.js`.

## Tests

Added `tests/activeclinic-phase8-mobile.test.js`. Assets bumped to **`v7-parity-12`**.

Passed: phase8, pass7, public website, booking, patient portal, shell, directory, phone standardization, appointment UI, reception UI, pharmacy UI, phase 5B, pass8 design system.

Pre-existing: `activeclinic-billing-ui-parity.test.js` (`describe` is not defined) — not a Phase 8 regression.

## Next

**PHASE 9 — accessibility deep audit.**
