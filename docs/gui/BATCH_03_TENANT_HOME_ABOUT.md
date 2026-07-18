# Batch 03 — Tenant public shell, Home, and About

**Date:** 2026-07-18  
**Scope:** Tenant shared shell + `/` (Home) + `/about` only  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_02_APEX_HOME_LOGIN_ACCOUNT.md`](./BATCH_02_APEX_HOME_LOGIN_ACCOUNT.md), [`BATCH_02B_APEX_MARKETING.md`](./BATCH_02B_APEX_MARKETING.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Tenant Home | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` | `01-public-home-desktop-v2 (Refined)` / `01-public-home-mobile-v2 (Refined)` |
| Tenant About | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` | `02-public-about-desktop-v3 (Populated)` / `02-public-about-mobile-v3 (Populated)` |

Obsolete IDs **not** used: base `01-public-home-*` copies, `02-public-about` base/sample frames.

## 2. Files changed

| Area | Path |
|------|------|
| Shell | `views/blessboard/v5/partials/tenant-public-shell-start.ejs` |
| Shell | `views/blessboard/v5/partials/tenant-public-shell-end.ejs` |
| Home | `views/blessboard/v5/public/home.ejs` |
| About | `views/blessboard/v5/public/about.ejs` |
| CSS | `public/blessboard/v5/tenant-public.css` (`?v=11`) |
| Model cache bump | `src/blessboard/http/loadTenantPublicPageModel.js` |
| Tests | `tests/blessboard-public-pages.test.js`, `tests/blessboard-v5-a11y-structure.test.js`, `tests/blessboard-tenant-routing.test.js` (apex hero assertion only) |
| Doc | `docs/gui/BATCH_03_TENANT_HOME_ABOUT.md` |

**Unchanged routes / backend:** hostname resolution, published-content queries, form actions, `/login` transfer, registration POST, SEO builders (presentation locals only: CSS version).

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Brand / shell | `publicName`, `primaryBranchDisplayName`, `hqBranchDisplayName`, `navItems`, `activeNav`, `loginHref`, `apexHref`, `showEnvBadge`, `dataEnvironment` |
| Footer contact | `publicContact.email` / `phone` (branch-preferred) with fallback to church `primaryEmail` / `primaryPhone` |
| Footer tagline | First published section body/heading snippet (`footerTagline`) — never invented |
| Home / About hero | First `hero` section (or first section): `heading`, `bodyText`, `mediaUrl` |
| Home body | Remaining published `sections[]` |
| About body | Sections classified by key/type/heading keywords: `story` / `mission` / `vision` / `values` / generic |
| Empty states | `showEmptyState`, `emptyHeadline`, `emptyMessage` from published-page model |

**No tenant logo URL in schema** — brand mark uses approved BlessBoard lockup (`/church/images/brand/blessboard-small-church-logo.png`) beside `publicName`. A dedicated tenant logo field would need a later schema decision (not invented here).

## 4. Image sources

| Usage | Source | Origin |
|-------|--------|--------|
| Header brand mark | `/church/images/brand/blessboard-small-church-logo.png` | Repo brand asset |
| Hero / section media | CMS `mediaUrl` via `safeExternalUrl` | Tenant published content only |
| Missing CMS media | CSS mesh / gradient fallback (`.bb-tp-hero__fallback`, `.bb-tp-page-hero__fallback`) | Local CSS — **not** stock sanctuary photos |

Stitch `lh3.googleusercontent.com` assets inspected for composition only — not hotlinked.

## 5. Empty-state behavior

| Page | When empty | UI |
|------|------------|----|
| Home | No published sections | Hero still renders (`publicName` / page title); intentional `bb-tp-empty` + Explore shortcuts + member band remain |
| About | No published sections | Page hero + empty status + Join CTA band remain |
| Never shown | Fabricated announcements, service times, prayer forms, stats, newsletter, member-count overlays |

## 6. Intentional deviations from Stitch

1. **Nav** uses full V5 CMS nav (Home, About, Leadership, Ministries, Events, Sermons, Contact, Giving) — longer than Stitch’s short mock nav; no dead links.
2. **Home** omits Stitch announcements archive, service-times sidebar, prayer form, digital-resources list, ministry demo cards, and floating “1.2k+ members” overlay.
3. **Explore** shortcut grid stands in for Stitch’s demo ministry/announcement widgets using real routes only.
4. **Mobile** uses drawer navigation (Stitch mobile bottom-tab / FAB member chrome omitted for public tenant sites).
5. **About** omits fabricated stats bar, “Watch Our Story”, community-impact grid, and annual-report download.
6. **Mission / vision / values** layouts appear only when published section keys/types/headings match; otherwise generic content blocks.
7. **Footer** omits newsletter subscribe and Privacy Policy (no route); includes Powered by GetPro.
8. **Primary** remains Sacred Modernity violet `#6C5CE7` + Hanken Grotesk (not Stitch Inter / alternate violet).

## 7. Unsupported Stitch functionality omitted

- Newsletter / social clusters / Privacy Policy route  
- Prayer request form  
- Hard-coded service schedules  
- Fabricated attendance / member / year-established metrics  
- Bottom public tab bar + FAB  
- Tenant-custom logo upload (no schema field)  
- Leadership / Ministries page interiors (Batch 4)

## 8. Responsive status

| Width | Status |
|-------|--------|
| 375px | Stacked hero; drawer menu; full-width CTAs under 360px |
| 768px | Two-column hero; purpose cards side-by-side; shortcuts 2-col |
| 1440px | Max content width + gutter token |
| 320px | Explicit overflow-x guard + tighter brand ellipsis / padding |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** (apex hero regex updated for title accent span) |
| `npm run test:blessboard:design-system` | **8/8 pass** |
| `npm run test:blessboard:a11y-structure` | **15/15 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

- Tenant-specific logo requires a settings/schema field before Stitch lockup parity.  
- About “Core Values” heading is structural chrome; value titles/bodies still require published sections.  
- Home still cannot mirror Stitch’s announcements/service-times without product-backed published entities (future batches).  
- Mobile Stitch bottom nav remains intentionally unimplemented on public tenant.  
- Leadership / Ministries / Events / Sermons / Contact / Giving are separate batches.

## 11. Suggested commit message

```
Polish tenant public shell, home, and about against refined Stitch.
```
