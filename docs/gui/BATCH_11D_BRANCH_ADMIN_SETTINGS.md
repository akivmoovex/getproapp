# Batch 11D — Branch admin Settings

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/settings` presentation only. **Registrations not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 59), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_11C_BRANCH_ADMIN_ACCOUNT.md`](./BATCH_11C_BRANCH_ADMIN_ACCOUNT.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Dedicated Branch Settings desktop | — | **STITCH_MISSING** |
| Dedicated Branch Settings mobile | — | **STITCH_MISSING** |
| Supporting card/section reference | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Supporting card/section reference | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |
| Shared UI States | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |
| Shell frame (unchanged) | `25-branch-admin-dashboard-*` | `001d1a02…` / `615f1f4e…` |

No dedicated branch Settings pair exists in the Stitch inventory. Composition uses Sacred Modernity + platform settings card/section pattern inside the Branch Admin shell.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/settings.ejs` | Section nav, editable profile/location cards, HQ read-only + product unavailable states, flash/error partials |
| `public/blessboard/v5/branch-admin.css` | Settings chrome (`?v=14`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-settings.test.js` | Render markers + field/omission assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Settings structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 59 Batch 11D note |
| `docs/gui/BATCH_11D_BRANCH_ADMIN_SETTINGS.md` | This document |

**Unchanged:** Settings GET/POST handlers, validation service, field names, CSRF, branch scoping, auth gates, schema, Registrations pages.

## 3. Settings fields (V5-supported)

### Editable (POST `/branch-admin/settings`)

| Field name | Section | Notes |
|------------|---------|-------|
| `publicName` | Profile & contact | Required |
| `email` | Profile & contact | Branch contact email |
| `phone` | Profile & contact | |
| `timezone` | Profile & contact | |
| `countryCode` | Profile & contact | |
| `addressLine1` / `addressLine2` | Location | |
| `city` / `provinceState` / `postalCode` | Location | |
| `latitude` / `longitude` | Location | Optional; validated server-side |
| `_csrf` | Form | Preserved |

### Read-only / unavailable (no inputs)

| Surface | Behavior |
|---------|----------|
| Church-controlled | Locked list: church profile + church defaults (HQ) |
| Not available | Branding, domain/DNS, billing, notifications, integrations |

## 4. Editable vs read-only behavior

- Editable cards carry `data-bb-settings-editable` / success “Editable” badge and live inputs.
- HQ section: `data-bb-settings-readonly="1"` — explanatory only; no HQ field names.
- Product section: `data-bb-settings-unavailable="product"` — dashed unavailable rows; no inventable controls.
- Success uses `flash-message`; validation errors use `form-errors` (existing `error` local).

## 5. Omitted controls

- Branding / logo / theme uploads
- Domain / DNS / custom hostname UI
- Billing / plans
- Notification preference toggles
- Integrations / API keys
- HQ fields (`denomination`, `websiteStatus`, `primaryEmail`, …)
- New schema columns or settings records

## 6. Desktop / mobile

| Width | Behavior |
|-------|----------|
| 320px | Compact section nav + unavailable rows |
| 375–699px | Stacked field grid; horizontal wrapping nav |
| ≥700px | 2-column field grid |
| ≥900px | Branch Admin shell sidebar (unchanged) |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:settings` | **7/7 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **44/44 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (68 hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. No dedicated Stitch Branch Settings desktop/mobile pair.
2. Platform settings Stitch still shows branding/DNS save UIs that V5 intentionally does not implement.
3. In-page section nav is anchor-based (no sticky sidebar settings rail).
4. Registrations queue deferred to a later batch.

## 9. Suggested commit message

```
Polish branch-admin settings cards while keeping V5 fields and CSRF.
```
