# BlessBoard V5 — Platform Admin parity audit

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** Platform Admin shared shell, Dashboard, Organization Directory, Organization Detail (incl. Entitlements), Plans, Subscriptions, Domains, Domain Detail, Deployments, Deployment Detail. Settings/Account noted where in shell.  
**Constraint:** Presentation / a11y fixes only. No new features, routes, schema, fabricated metrics, operational controls, or media work.

**Companion docs:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), Batches 19A–21D.

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with Stitch within intentional product limits; remaining gaps are cosmetic or documented omissions |
| **MINOR GAPS** | Usable Stitch composition with small spacing/copy/chrome differences |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics V5 schema does not provide |
| **BLOCKED BY MISSING STITCH** | V5 surface has no dedicated Stitch desktop/mobile pair |

## Demo readiness verdict

**Ready for Platform Admin end-to-end demo testing** — with known intentional omissions (no fabricated MRR/uptime/tickets/health meters, no create-org UI, no DNS/SSL/verify automation, no deploy/restart/rollback/env edit/log stream, no billing checkout). Apex + `platform_admin` authz, CSRF on mutations, deployment identity (`PLATFORM_DEPLOYMENT_CODE`), empty/no-results states, desktop tables + mobile cards, and secret exclusion are in place.

Do **not** begin media work from this audit.

---

## Screen classifications

| Screen | Desktop Stitch | Mobile Stitch | Classification | Notes |
|--------|----------------|---------------|----------------|-------|
| Platform Admin shell | `36c4708b025b4e7eaeab9ed508603b03` (62-*) | `513dd5cc58c74b21bd7ee8d106dfac55` | **CLOSE PARITY** | Dark ops sidebar ≥900px; header/drawer/bottom tabs &lt;900px; skip → `#bb-pa-main`; enabled V5 nav only |
| Dashboard | `36c4708b…` | `513dd5cc…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live org/church counts; unavailable cards for tenants/plans/tickets/health; no fabricated MRR/activity |
| Organization Directory | `18da9665bc674d2dbd249cbbb269d58d` (63-*) | `db6b741d99e34d10b01496a83de5072a` | **CLOSE PARITY** | Key-prefix search + table/cards; empty-state partial; no create/export/MRR |
| Organization Detail | `10f1dceb6d694563aaf152ecaedac3d3` (65-*) | `6633fa49f7b9420a8c1705f1e43c9efb` | **CLOSE PARITY** | Catalogue + domains/branches + subscription; breadcrumb present |
| Entitlements (on org detail) | (65-* aside) | same | **CLOSE PARITY** / **MINOR GAPS** | Capacity/capability groups; plan vs override; allowlisted CSRF form; Stitch billing chrome omitted |
| Plans | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` (66-*) | `b5953809962f4e0a8eae4ea96aa4575a` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live `platform.plans` cards/table; no prices/create/custom tiers |
| Subscriptions | `4d0f59ac…` (shared 66) | `b5953809…` | **CLOSE PARITY** / **BLOCKED BY DATA** / **BLOCKED BY MISSING STITCH** | Dedicated list adapted from Plans pair; no checkout/invoices/payments |
| Domains directory | `30e3856782bd41b6bf14402e1e535cbd` (67-*) | `efb0fd24f1184968be79083974dcd092` | **CLOSE PARITY** / **BLOCKED BY MISSING STITCH** | Adapted from Settings; live filters + table/cards; Clear on no-results (this audit) |
| Domain Detail | `30e38567…` (67 adapted) | `efb0fd24…` | **CLOSE PARITY** / **BLOCKED BY MISSING STITCH** | Operational vs verification; CSRF status/org when deployment-scoped; breadcrumb this audit |
| Deployments directory | `74cbe4a015754137ad414222f3941ef2` (68-*) | `9f40042097d7471db1f5628fbb0d27d8` | **CLOSE PARITY** / **BLOCKED BY DATA** | Registry only; Stitch tickets/health/Force Sync unavailable |
| Deployment Detail | `74cbe4a0…` (68 adapted) | `9f400420…` | **CLOSE PARITY** / **BLOCKED BY MISSING STITCH** / **BLOCKED BY DATA** | Safe summary/env/products/domains + catalogue diagnostics; breadcrumb this audit |
| Settings | `30e38567…` | `efb0fd24…` | **CLOSE PARITY** | Read-only DNS patterns + reserved labels; breadcrumb this audit; no save UI |
| Account | — | — | **BLOCKED BY MISSING STITCH** | Identity panel + logout CSRF; breadcrumb + `aria-label` this audit |
| Create organization | `d992150d…` / `0da4f454…` | — | **BLOCKED BY DATA** (product) | CLI provisioning only; no V5 create-org UI by design |

**Summary counts (audited surfaces in scope):** CLOSE PARITY **11** · MINOR GAPS **1** (entitlements chrome) · MATERIAL GAPS **0** · BLOCKED BY DATA **5** (partial, shared with CLOSE) · BLOCKED BY MISSING STITCH **5** (Subscriptions dedicated pair, Domains/Domain Detail/Deployment Detail pairs, Account).

---

## Fixes applied this audit (presentation only)

| Fix | Files |
|-----|-------|
| Breadcrumbs on Account, Settings, Domain Detail, Deployment Detail | `account.ejs`, `settings.ejs`, `domain-detail.ejs`, `deployment-detail.ejs` |
| Account: `aria-label`, identity panel | `account.ejs` |
| Filtered no-results Clear actions on Subscriptions + Domains | `subscriptions.ejs`, `domains.ejs` |
| Pager `__nav` + `__links` unify | `subscriptions.ejs`, `domains.ejs`, `platform-admin.css` |
| Broader `:focus-visible` (wordmark, org-list, domain card CTAs) | `platform-admin.css` |
| `.bb-pa-btn` touch min-height; filter action touch; muted chip contrast; key wrap; bottom-tab type at 320 | `platform-admin.css` |
| Shell-end fallback nav aligned to full `PLATFORM_ADMIN_NAV` | `platform-admin-shell-end.ejs` |
| CSS cache bump | `platform-admin.css?v=21` |

**Preserved:** all routes, queries, CSRF, authz, schema, migrations, `PLATFORM_DEPLOYMENT_CODE` identity, domain resolution, tenant routing, no fabricated metrics or operational controls.

---

## Responsive check (320 / 375 / 768 / 1024 / 1440)

| Width | Shell | Content |
|-------|-------|---------|
| **320px** | Header + bottom tabs + drawer; `overflow-x` guarded | Stacked cards; filters wrap; keys wrap; tab labels ~0.7rem |
| **375px** | Same mobile chrome | Same stacking; page-head actions wrap |
| **768px** | Still mobile chrome (&lt;900) | ≥700 grids for org-detail / subs filter / dl grids; tables still card-mode &lt;900 |
| **1024px** | Desktop sidebar | Tables visible; cards hidden ≥900 |
| **1440px** | Same as 1024 | Centered main; sticky sidebar; plans 3-col ≥1200 |

**Note:** CSS breakpoints are **320 / 700 / 800 / 900 / 1200** (not literal 375/768/1024/1440). Demo widths are covered by the nearest rules.

---

## Accessibility checklist

| Check | Status |
|-------|--------|
| Skip → `#bb-pa-main` | Pass |
| Landmarks (main, nav, drawer) | Pass |
| Keyboard / focus-visible on shell + list/detail controls | Pass (extended this audit) |
| Headings | Pass (`h1` + section titles) |
| Breadcrumbs on detail / account / settings | Pass (this audit) |
| Form labels + CSRF | Pass on POST surfaces (plan assign, entitlement override, domain status/org, logout) |
| Contrast (violet on warm surfaces; muted chips darkened) | Pass within Sacred Modernity tokens |
| Empty / no-results states | Pass; Clear on filtered subs/domains |
| `prefers-reduced-motion` | Pass |
| Touch ≥44px on buttons / icon controls | Pass (base `.bb-pa-btn` this audit) |

---

## Secrets / sensitive-data exclusion

| Check | Status |
|-------|--------|
| No `DATABASE_URL` / `SESSION_SECRET` values rendered | Pass |
| No `session_cookie_name` selected in safe deployment queries | Pass |
| No transfer tokens / hashes / passwords in PA templates | Pass |
| Deployment diagnostics show pass/fail/unavailable only | Pass |
| Org UUIDs not shown in directory (keys only) | Pass (shell tests) |

---

## Intentional Stitch omissions (do not “fix”)

- Fabricated dashboard MRR, uptime, ticket queues, activity feeds, health meters  
- Create Organization UI (Stitch 64) — CLI provisioning only  
- Plan prices, custom tiers, conversion / SLA chrome  
- Subscription checkout, invoices, payments, billing portal  
- DNS lookup, certificate provisioning, domain purchase, verify jobs  
- Deploy / restart / rollback / env-var editing / log streaming  
- Force Sync, Export Reports, Support Tickets on deployments  
- Raw secrets, cookie names, connection strings, transfer tokens  

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:platform:sessions` | **3/3 pass** |
| `npm run test:platform:host-comparison` | **24/24 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

---

## Remaining gaps (acceptable for demo)

1. Subscriptions / Domains / Domain Detail / Deployment Detail reuse parent Stitch pairs rather than dedicated screens.  
2. Dashboard / Deployments remain **BLOCKED BY DATA** for Stitch ticket/health KPI chrome.  
3. Account has no dedicated Stitch pair — Sacred Modernity composition is intentional.  
4. Create-org Stitch exists but V5 product keeps provisioning CLI-only.  
5. Entitlements live on Organization Detail rather than a standalone Stitch billing surface.

**Media work:** Batch 22 shared media picker polish complete (`BATCH_22_SHARED_MEDIA.md`). Platform Admin surfaces unchanged by that batch.
