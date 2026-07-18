# BlessBoard V5 — responsive & accessibility audit

**Date:** 2026-07-18  
**Scope:** Implemented V5 shells and representative screens only. No layout redesign.  
**Method:** Structural CSS/HTML/JS review against the viewport matrix below; confirmed defects fixed; GUI + a11y-structure tests added.

## Viewport matrix

| Viewport | Class |
|----------|--------|
| 1440 × 900 | Desktop wide |
| 1280 × 800 | Desktop |
| 1024 × 768 | Small laptop / large tablet landscape |
| 768 × 1024 | Tablet portrait |
| 430 × 932 | Large phone |
| 390 × 844 | Phone |
| 360 × 800 | Small phone |

Representative surfaces reviewed: apex marketing/auth, tenant public, member portal, HQ admin, branch admin, platform admin, content admin forms, media picker dialog, tables/forms on reports/resources/org directory.

## Audit checklist results

| Criterion | Status | Notes |
|-----------|--------|-------|
| Horizontal overflow | **Fixed** | Shell bodies use `overflow-x: clip`; frames/mains `min-width: 0`; table wraps keep `overflow-x: auto` |
| Clipped text | Pass | No confirmed clipping after tab-grid fix; titles wrap via existing flex |
| Overlapping cards | Pass | No confirmed overlap in CSS structure |
| Navigation overflow | **Fixed** | Platform mobile shortcut tabs were `repeat(3)` with **4** items → now `repeat(4, minmax(0,1fr))` |
| Mobile drawers | **Fixed** | Shared `shell-nav.js`: Escape, body scroll lock class, focus to close, restore to toggle, Tab cycle |
| Table responsiveness | Pass (hardened) | Explicit `-webkit-overflow-scrolling: touch` on table wraps |
| Form labels | Pass | Existing `label for=` / field patterns retained |
| Error summaries | Pass | `form-errors.ejs` keeps `role="alert"` + `aria-live="assertive"` |
| Focus order | **Fixed** | Drawer open moves focus into menu; close returns to toggle |
| Focus visibility | **Fixed** | `:focus-visible` rings on shell nav, toggles, bottom tabs, media picker controls |
| Heading hierarchy | Pass | Shell page titles remain single `h1` pattern in audited templates |
| Landmarks | Pass | Skip link → `main` id; `aside`/`nav`/`header`/`footer` present on shells |
| Contrast | Pass (tokens) | Violet on light surfaces / charcoal sidebar text meet shell token intent; no new low-contrast chrome added |
| Touch targets | **Fixed** | Bottom tabs, menu toggles, icon links, drawer close ≥ `--bb-touch-min` (44px) |
| Reduced motion | **Fixed** | Admin/member/platform shells + tenant-public + media progress honor `prefers-reduced-motion` |
| Screen-reader labels | Pass (hardened) | Menu toggles already `aria-controls`; drawers set `role="dialog"` + `aria-modal` when open; media dialogs `aria-labelledby` |
| Modal focus trapping | **Fixed** | Media picker uses native `<dialog>`; archive confirm labelled; admin drawers Tab-cycle via `shell-nav.js`; tenant public already trapped |
| Escape behavior | **Fixed** | Platform admin previously lacked Escape; all admin/member drawers now close on Escape |
| Body scroll locking | Pass (hardened) | Existing `*-drawer-open { overflow: hidden }` retained; platform uses same helper |

## Confirmed fixes (this pass)

1. Platform mobile tabs 3-column grid vs 4 shortcuts → overflow/cramp on ≤430px.  
2. Platform drawer: no Escape / focus restore.  
3. HQ / branch / member drawers: Escape closed but did not restore focus; no Tab trap.  
4. Missing `:focus-visible` on shell chrome (nav, tabs, toggles).  
5. Touch targets below 44px on bottom tabs / icon toggles.  
6. Missing `prefers-reduced-motion` on admin/member/platform/tenant-public/media progress.  
7. Page-level horizontal scroll risk from wide tables → `overflow-x: clip` + `min-width: 0`.  
8. Media picker / archive confirm missing `aria-labelledby`.

## Deferred / not redesigned

- Full visual Stitch parity at every breakpoint (out of scope).  
- Platform / HQ dense sidebar label wrapping at extreme zoom (acceptable).  
- Nested `<dialog>` focus edge cases on very old browsers without dialog support.  
- Automated pixel screenshots at all seven viewports (structure tests cover contracts).

## Tests

| Script / file | Purpose |
|---------------|---------|
| `npm run test:blessboard:a11y-structure` | Shell landmarks, drawer attrs, CSS contracts, media picker a11y, shell-nav Escape/focus |
| `npm run test:blessboard:design-system` | Shared DS focus-visible + reduced-motion primitives |
| `npm run test:blessboard:hq-shell` | HQ GUI smoke |
| `npm run test:blessboard:branch-admin-shell` | Branch GUI smoke |
| `npm run test:blessboard:platform-admin-shell` | Platform GUI smoke |
| `npm run test:blessboard:apex-home` | Apex marketing shell |
| `npm run test:blessboard:public-pages` | Tenant public pages |

## Files touched

- `public/blessboard/v5/shell-nav.js` (new)  
- `public/blessboard/v5/{hq,branch}-admin.js`, `member-portal.js`, platform shell end  
- `public/blessboard/v5/{hq-admin,branch-admin,member-portal,platform-admin,tenant-public,media-picker}.css`  
- `public/blessboard/v5/media-picker.js`  
- Shell partial CSS/JS cache bumps  
- `tests/blessboard-v5-a11y-structure.test.js`  
- `package.json` script `test:blessboard:a11y-structure`
