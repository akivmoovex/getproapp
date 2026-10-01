# V2.04 BB Stitch — Phase 1 Shared UI Primitives

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_SHARED_UI_PRIMITIVES` |
| **Phase** | 1 — SHARED UI PRIMITIVES |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Authority** | `docs/implementation/V2_04_BB_STITCH_SCREEN_MAP.md` + Stitch design-system REFERENCE |

## Result

**BB_V204_SHARED_UI_PRIMITIVES_PASS**

## Summary

Extended platform `gp-ops-*` with missing Stitch-screen primitives (token-based CSS). Added BB `v204/*` wrappers for product wording (Church ID duplicate banner). No final member/attendance/request screens. AC shells unchanged except consuming the same expanded `gp-ops-shared.css` structurally.

## FILES_CHANGED

### Platform (created)
- `views/platform/partials/gp-ops-page-header.ejs`
- `views/platform/partials/gp-ops-form-section.ejs`
- `views/platform/partials/gp-ops-field.ejs`
- `views/platform/partials/gp-ops-search-input.ejs`
- `views/platform/partials/gp-ops-banner.ejs`
- `views/platform/partials/gp-ops-match-card.ejs`
- `views/platform/partials/gp-ops-confirm-dialog.ejs`
- `views/platform/partials/gp-ops-loading-state.ejs`
- `views/platform/partials/gp-ops-success-state.ejs`
- `public/platform/gp-ops-dialog.js`

### Platform (modified)
- `public/platform/gp-ops-shared.css` — styles for new primitives via V2.04 semantic tokens

### BB wrappers (created)
- `views/blessboard/v5/partials/v204/*` (page-header, status-chip, duplicate-warning-banner, person-match-card, confirm-dialog, empty/loading/success, form-section, field, audit-timeline, filter-bar)

### BB shells (opt-in only)
- `views/blessboard/v5/partials/hq-shell-start.ejs` / `hq-shell-end.ejs`
- `views/blessboard/v5/partials/branch-admin-shell-start.ejs` / `branch-admin-shell-end.ejs`
- Flag: `loadGpOpsAssets` (default off — preserves PC09 isolation)

### Tests
- `tests/v2-04-bb-shared-ui-primitives.test.js` (new)
- `tests/v10-pc09-platform-ops-ui-primitives.test.js` (token neutrality + expanded partial list + BB opt-in)

## COMPONENTS_REUSED

| Component | Source |
|-----------|--------|
| Status chip/badge | `gp-ops-status-badge` |
| Search/filter bar | `gp-ops-filter-bar` (+ new standalone `gp-ops-search-input`) |
| Status tabs | `gp-ops-status-tabs` |
| Empty state | `gp-ops-empty-state` |
| Audit timeline | `gp-ops-timeline` |
| Card shell | `gp-ops-card` |
| Phone field | `views/platform/partials/phone-field.ejs` |
| Theme tokens | `public/platform/theme/colors.css` / `--color-*` / `--badge-*` / `--modal-*` |

## COMPONENTS_CREATED

| Platform | BB wrapper (wording/config only) |
|----------|----------------------------------|
| `gp-ops-page-header` | `v204/page-header` |
| `gp-ops-form-section` | `v204/form-section` |
| `gp-ops-field` | `v204/field` |
| `gp-ops-search-input` | (via `v204/filter-bar`) |
| `gp-ops-banner` | `v204/duplicate-warning-banner` (Church ID copy) |
| `gp-ops-match-card` | `v204/person-match-card` |
| `gp-ops-confirm-dialog` + `gp-ops-dialog.js` | `v204/confirm-dialog` |
| `gp-ops-loading-state` | `v204/loading-state` |
| `gp-ops-success-state` | `v204/success-state` |
| — | `v204/status-chip`, `v204/empty-state`, `v204/audit-timeline`, `v204/filter-bar` |

## TESTS

```bash
node --test tests/v2-04-bb-shared-ui-primitives.test.js tests/v10-pc09-platform-ops-ui-primitives.test.js
```

## GAPS

1. **No final Stitch screens** wired yet (Phase 2+).
2. **Mobile Stitch frames** still missing for most M/A screens — primitives are responsive, visual parity deferred.
3. **Legacy BB `bb-ds-*` partials** (`page-header`, `empty-state`, etc.) preserved for existing screens; new V2.04 flows should prefer `v204/*` + `loadGpOpsAssets`.
4. **Stitch design-doc brand-primary `#2563EB`** conflicts with Sacred Modernity violet — platform uses product `[data-product]` brand tokens; do not hardcode Stitch blue into shared CSS.
5. **Iconography** — banner uses a token-colored marker dot; Material icon slots can be added when screens mount without baking BB icons into platform.

BB_V204_SHARED_UI_PRIMITIVES_PASS
