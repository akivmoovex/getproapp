# BlessBoard V5 — Tenant public website parity audit

**Date:** 2026-07-18  
**Scope:** Shared tenant shell + Home, About, Leadership, Ministries, Events, Sermons, Contact, Giving + Registration, Registration submitted + Tenant login / authentication presentation states  
**Out of scope:** Member portal, branch admin, HQ, platform admin (not started)  
**Constraint:** Presentation fixes only. No routes, data, queries, auth, schema, or authorization changes. No fabricated content.

**Stitch project:** `projects/17124191473876947591` — GetPro Church Platform  
**Canonical IDs:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) orders 13–25, 91  
**Prior batches:** [`BATCH_03`](./BATCH_03_TENANT_HOME_ABOUT.md) … [`BATCH_07`](./BATCH_07_TENANT_AUTH_REGISTRATION.md)

## Status legend

| Classification | Meaning |
|----------------|---------|
| **CLOSE PARITY** | Composition, chrome, and tokens align with Stitch for supported V5 content; remaining diffs are intentional product/token choices |
| **MINOR GAPS** | Clear but small presentation diffs remain (spacing/typography chrome) that do not block demo routing |
| **MATERIAL GAPS** | Layout or interaction model differs enough that Stitch is not a fair demo match for that surface |
| **BLOCKED BY DATA** | Stitch widgets need fields, CMS content, or workflows V5 does not support — omitted rather than faked |
| **BLOCKED BY MISSING STITCH ASSET** | V5 surface has no dedicated Stitch desktop/mobile pair |

---

## 1. Audit method

1. Compared each live V5 template + `tenant-public.css` / `tenant-auth.css` against canonical Stitch desktop **and** mobile IDs from the screen map (MCP `get_screen` for Home desktop confirmed; batch docs for remaining pairs).
2. Measured differences in typography, spacing, widths, alignment, image crop, colors, borders, radii, shadows, navigation, footer, and mobile stacking.
3. Fixed only **clear presentation** gaps in shell CSS/templates (focus selectors, radii, touch targets, sticky footer, footer Quick Links completeness, auth focus/radius consistency).
4. Verified shared shell consistency across all public pages (same start/end partials + `cssHref?v=15`).
5. Responsive review at **320 / 375 / 768 / 1024 / 1440** (CSS breakpoints: 320, 360, 640, 768, 900, 1440 — 1024 inherits 900+ rules).
6. Accessibility: skip link, headings, labels, focus-visible, drawer focus trap, reduced motion, contrast tokens.
7. Ran focused tenant-public GUI/security tests + stylelint on changed V5 CSS + `git diff --check`.

---

## 2. Shared tenant shell

| Item | Detail |
|------|--------|
| Templates | `partials/tenant-public-shell-start.ejs`, `tenant-public-shell-end.ejs` |
| CSS / JS | `tenant-public.css?v=15`, `tenant-public.js`, design-system |
| Stitch | Embodied across public page frames (order 91) — no standalone shell screen |
| **Status** | **CLOSE PARITY** (with intentional nav/footer product diffs) |

### Presentation fixes this audit

| Fix | Notes |
|-----|-------|
| Body flex column + `overflow-x: clip` | Sticky footer; horizontal overflow guard |
| Main `flex: 1` | Footer pins to bottom on short pages |
| Skip link `:focus` / `:focus-visible` | Visible skip target |
| Menu / drawer close → `--bb-touch-min` (44px) | Touch targets |
| Primary buttons → `--bb-radius` (16px) | Sacred Modernity radii |
| Drawer width / z-index tokens | `--bb-drawer-w`, `--bb-z-drawer` |
| Hero title → `--bb-text-hero` | Tokenized display size |
| Form controls 16px radius + control height | Contact/register-adjacent chrome |
| Footer link min-height touch targets | A11y |
| Focus selector fix | `.bb-tp-nav__link:focus-visible` (was broken `.bb-tp-nav-link`) |
| Footer Quick Links | Added Home, Leadership, Contact; Powered-by deduped to copyright bar |
| Auth CSS | Input/button radius `--bb-auth-radius`; `:focus-visible`; broader reduced-motion; cache `?v=6` |

### Intentional shell deviations (not bugs)

1. Full V5 CMS nav (8 items) vs Stitch short mock nav.
2. Mobile **drawer** vs Stitch bottom-tab / FAB member chrome (public sites).
3. Brand mark = BlessBoard lockup + `publicName` (no tenant logo URL in schema).
4. Footer omits newsletter / social / Privacy Policy route; includes Powered by GetPro.
5. Primary `#6C5CE7` + Hanken Grotesk (not Stitch Inter / alternate violet).

### Shell consistency check

| Page | Uses shared shell | Same CSS version | Same footer Quick Links |
|------|-------------------|------------------|-------------------------|
| Home … Giving | Yes | `?v=15` | Yes |
| Register / Submitted | Auth layout (`tenant-auth.css`) — no public footer shell | N/A | N/A |
| Tenant `/login` | Redirect → apex transfer (no tenant password chrome) | N/A | N/A |

---

## 3. Page-by-page status

| Page | Desktop Stitch | Mobile Stitch | Classification | Notes |
|------|----------------|---------------|----------------|-------|
| Shared shell | (see public frames) | (see public frames) | **CLOSE PARITY** | Fixes above; intentional nav/footer product diffs |
| Home `/` | `ead45db5…` | `89177588…` | **BLOCKED BY DATA** + **MINOR GAPS** | Composition close for hero + sections; omits Stitch announcements, service times, prayer form, member-count overlay, demo ministry cards |
| About `/about` | `44492f6a…` | `3f0b8a5c…` | **BLOCKED BY DATA** + **MINOR GAPS** | Mission/vision/values only when published keys match; omits stats bar, Watch Our Story, impact grid, annual report |
| Leadership `/leadership` | `372faa60…` | `0f4e816f…` | **CLOSE PARITY** when published leaders exist; empty → **CLOSE PARITY** vs empty frame | Flat sort order (no role grouping); no Contact Pastor / View Profile |
| Ministries `/ministries` | `f146cdcc…` | `d2fd7ecc…` | **CLOSE PARITY** when published; else empty chrome | No category chips; no Join Team / schedule |
| Events `/events` | `6f618576…` | `f58c416c…` | **CLOSE PARITY** (list model) | Calendar Stitch obsolete — intentional list/featured only |
| Sermons `/sermons` | `4f4995dc…` | `96b380d4…` | **CLOSE PARITY** + **BLOCKED BY DATA** | No series/scripture/duration/image schema; featured gradient panel |
| Contact `/contact` | `ab93d842…` | `9cbad6aa…` | **MATERIAL GAPS** (form) → classified **BLOCKED BY DATA** | No contact form (unsupported); map only with lat/lng; no office hours |
| Giving `/giving` | `59c8fded…` | `a0616f23…` | **MATERIAL GAPS** (payments) → classified **BLOCKED BY DATA** | Info-only methods; no gateway/QR/amount UI |
| Registration `/register` | `c360aef6…` | `7d771905…` | **MINOR GAPS** + **BLOCKED BY DATA** | Single-page V5 fields only (not wizard); no password/gender/consent POST |
| Registration submitted | `1d377043…` | `f222e551…` | **CLOSE PARITY** | No fabricated timing/ID |
| Tenant login | `9b264ef3…` / `68a84bcc…` (password card) | same | **MATERIAL GAPS** (product) | Tenant `/login` → apex transfer; **no** tenant password UI by design |
| Apex login (transfer) | same login IDs (chrome) | same | **MINOR GAPS** | Dual-pane transfer chrome; no forgot-password |
| Auth error | — | — | **BLOCKED BY MISSING STITCH ASSET** | Shares login chrome; classified expired/throttled/generic only |
| Waiting verification | `239beae5…` | `8e6e504f…` | **BLOCKED BY MISSING STITCH ASSET** / product MISSING | No V5 route — not built |
| Forgot password | `61a6861b…` | `f4bb9457…` | product MISSING | No V5 route — not built |

### Consolidated verdict per user-facing page

| Surface | Final label |
|---------|-------------|
| Shared shell | CLOSE PARITY |
| Home | BLOCKED BY DATA (widgets); chrome CLOSE / MINOR GAPS |
| About | BLOCKED BY DATA; chrome CLOSE / MINOR GAPS |
| Leadership | CLOSE PARITY |
| Ministries | CLOSE PARITY |
| Events | CLOSE PARITY |
| Sermons | CLOSE PARITY (content fields BLOCKED BY DATA) |
| Contact | BLOCKED BY DATA |
| Giving | BLOCKED BY DATA |
| Registration | MINOR GAPS |
| Registration submitted | CLOSE PARITY |
| Tenant login / auth states | MATERIAL GAPS vs Stitch password card; transfer chrome CLOSE / MINOR; auth-error BLOCKED BY MISSING STITCH ASSET |

---

## 4. Measurable differences (summary)

| Dimension | Stitch | V5 | Action |
|-----------|--------|----|--------|
| Typography | Inter + display sizes | Hanken + `--bb-text-*` / `--bb-text-hero` | Intentional token system |
| Primary color | Alternate violet in some frames | `#6C5CE7` | Intentional Sacred Modernity |
| Radii | ~16px cards/buttons | `--bb-radius` / `--bb-auth-radius` | **Fixed** to tokens |
| Shadows | Soft card elevation | Token shadows; reduced hover lift under `prefers-reduced-motion` | Aligned |
| Nav width | Short mock set | Full CMS set | Intentional |
| Footer | Newsletter / social / Privacy | Quick Links + contact + members + GetPro | **Fixed** Quick Links completeness; newsletter not invented |
| Image crop | Stock sanctuary / portraits | CMS `mediaUrl` / initials / mesh fallback | No hotlinked Stitch assets |
| Mobile stacking | Bottom tabs | Drawer + stacked sections | Intentional |
| Contact form | Send Message | Omitted | BLOCKED BY DATA |
| Giving payment | Donate / QR | Info + external link | BLOCKED BY DATA |
| Events calendar | Month grid | List/featured | Intentional product model |
| Focus rings | Mixed | `:focus-visible` violet ring | **Fixed** broken nav selector |

---

## 5. Responsive results

| Width | Shell / pages | Auth |
|-------|---------------|------|
| **320px** | Overflow clip; reduced padding; cards `min-width: 0` | Auth overflow guards; reduced card radius |
| **375px** | Drawer nav; heroes/sections single column; lists stacked | Single-column auth main |
| **768px** | Featured two-column; grids 2-col; header still compact | Field rows approach 2-col near 900px |
| **1024px** | Inherits `min-width: 900px` grids (2–3 col); desktop nav visible | Split panel when viewport allows |
| **1440px** | Max-width content; leader 4-col / ministry·event·sermon 3-col | Split panel + 2-col name rows |

No horizontal scroll regressions expected after `overflow-x: clip` + 320px guards. Dense 8-item desktop nav may wrap/truncate visually on mid widths — intentional product nav, not fake shortening.

---

## 6. Accessibility results

| Check | Result |
|-------|--------|
| Skip link | Present; focus-visible reveals |
| Landmarks | `header`, `main#bb-tp-main`, `footer`, drawer `role="dialog"` + `aria-modal` |
| Headings | Page heroes + section/footer `h2` patterns preserved |
| Labels | Forms use associated labels; password toggle labeled; external links labeled |
| Keyboard / focus | Drawer Escape + Tab trap; `:focus-visible` on nav, buttons, footer, auth controls |
| Contrast | Violet on white / white on violet CTAs; ink on warm surfaces |
| Reduced motion | `prefers-reduced-motion: reduce` strips transitions/animations on public + auth |
| Touch | Menu/close/footer links ≥ ~44px |

---

## 7. Tests and lint

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:blessboard:member-registration` | **13/13 pass** |
| `npm run test:blessboard:apex-auth-gui` | **4/4 pass** |
| `npm run test:blessboard:tenant-auth` | **13/13 pass** |
| `npm run test:blessboard:a11y-structure` | **21/21 pass** |
| `npx stylelint` on `tenant-public.css` + `tenant-auth.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

Note: DB-backed suites must run sequentially; parallel local DB creates can collide on `pg_database_datname_index`.

---

## 8. Demo-routing readiness

**Yes — ready for tenant public demo routing**, with these demo caveats:

1. Publish real Home/About sections, leaders, ministries, events, sermons, contact channels, and giving methods for a populated look.
2. Do not demo Stitch contact form, payment giving, calendar Events, tenant password login, forgot-password, or waiting-verification — those are omitted or transfer-based by product design.
3. Tenant `/login` correctly demonstrates apex transfer, not the Stitch password card.

Blocked differences that remain are **data/product**, not unfinished shell chrome.

---

## 9. Files changed (this audit)

| Path | Change |
|------|--------|
| `public/blessboard/v5/tenant-public.css` | Shell/page presentation parity (`?v=15`) |
| `public/blessboard/v5/tenant-auth.css` | Auth radii, focus, reduced motion (`?v=6`) |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS `?v=15` |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | Footer Quick Links + Powered-by dedupe |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=15` |
| `views/blessboard/v5/public/register.ejs` | Auth CSS `?v=6` |
| `views/blessboard/v5/public/register-submitted.ejs` | Auth CSS `?v=6` |
| `views/blessboard/v5/apex/login.ejs` | Auth CSS `?v=6` |
| `views/blessboard/v5/apex/auth-error.ejs` | Auth CSS `?v=6` |
| `tests/blessboard-v5-a11y-structure.test.js` | Shell focus/footer assertions |
| `docs/gui/TENANT_PUBLIC_PARITY_AUDIT.md` | This document |

---

## 10. Suggested commit message

```
Tighten tenant public shell parity: focus, radii, touch targets, and footer nav.
```
