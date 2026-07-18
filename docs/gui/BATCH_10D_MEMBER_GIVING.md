# Batch 10D — Member Giving Information

**Date:** 2026-07-18
**Scope:** Member `/member/giving` information screen only. **Prayer request not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 36), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_10C_MEMBER_REQUESTS.md`](./BATCH_10C_MEMBER_REQUESTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Giving Information | `24-member-giving-information-desktop` | `3e72367008054943b23f6c690bac8eea` |
| Mobile Giving Information | `24-member-giving-information-mobile` | `236d4bf2f588459f8cde18bd164b09cd` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/member/giving.ejs` | Stitch chrome, notices, method cards, empty/disclaimer |
| `src/blessboard/http/memberPortalRoutes.js` | Type labels + safe presentation map (no IDs) |
| `public/blessboard/v5/member-portal.css` | Giving hero / notice / cards (`?v=18`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-portal.test.js` | Visibility, draft hide, auth, anti-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Member giving structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 36 note (Batch 10D) |
| `docs/gui/BATCH_10D_MEMBER_GIVING.md` | This document |

**Unchanged:** `listPublishedGivingMethods` (published + branch-scoped only), `safeExternalUrl`, member gate (`requireActiveMember`), GET-only route (no POST/checkout).

## 3. Data used (real V5 only)

| Field | Source | Shown when |
|-------|--------|------------|
| `methodType` | `blessboard.giving_methods.method_type` | Always (for icon + type label) |
| `typeLabel` | Derived from `methodType` | Always |
| `label` | `giving_methods.label` | Always |
| `instructions` | `giving_methods.instructions` | When non-empty |
| `externalUrl` | `giving_methods.external_url` via `safeExternalUrl` | When valid https URL |
| Church name | Tenant `displayName` | Hero / methods intro only |

Draft / archived methods are not listed. Method UUIDs, church/branch IDs, and giving-entry balances are never rendered.

## 4. Safety notes

| Concern | Behavior |
|---------|----------|
| Auth | Active member session required; unauthenticated denied |
| Tenant scope | Published methods for the resolved church + primary branch only |
| Payment collection | No forms, card fields, amounts, or checkout |
| Private finance | No account numbers invented; only published instruction text |
| External links | `rel="noopener noreferrer"` + `target="_blank"`; URL sanitized |
| Instructional framing | Info notice + disclaimer state that the page is information-only |

## 5. Unsupported Stitch elements omitted (deviations)

- QR / “Scan to Give” and “Generate One-Time Link”
- Fabricated bank/mobile numbers, merchant codes, SWIFT rows
- “Where does your money go?” 85%/15% gauges
- International Partners / In-Kind Donations promo cards
- Donation history, balances, Member ID reference prompts
- Checkout or payment gateway UI

## 6. Empty state

| State | Marker |
|-------|--------|
| No published methods | `data-bb-giving-empty="catalog"` |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-portal` | **16/16 pass** (visibility, draft hide, auth, anti-fabrication) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **41/41 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish member giving information with published methods only.
```
