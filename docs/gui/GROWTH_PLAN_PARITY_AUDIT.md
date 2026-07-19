# BlessBoard V5 — Growth plan full GUI parity audit

**Date:** 2026-07-19  
**Branch:** `V5` @ `de660d3` (+ FG-Q12 giving gate fix in this audit)  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** Foundation surfaces retained by Growth + Growth-only multi-branch HQ administration, advanced reports, and cross-branch oversight. Network-only capabilities excluded.  
**Constraint:** Safe GUI / soft entitlement fixes only. No schema, billing checkout, Network features, fabricated analytics, or catalogue-aspirational screens.

**Companions:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`HQ_ADMIN_PARITY_AUDIT.md`](./HQ_ADMIN_PARITY_AUDIT.md) · [`BRANCH_ADMIN_PARITY_AUDIT.md`](./BRANCH_ADMIN_PARITY_AUDIT.md) · [`MEMBER_PORTAL_PARITY_AUDIT.md`](./MEMBER_PORTAL_PARITY_AUDIT.md) · [`TENANT_PUBLIC_PARITY_AUDIT.md`](./TENANT_PUBLIC_PARITY_AUDIT.md) · [`BATCH_FG08A_HQ_REPORTS.md`](./BATCH_FG08A_HQ_REPORTS.md) · [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with Stitch within intentional product limits |
| **MINOR GAPS** | Usable Stitch composition with small spacing/copy/chrome differences |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics V5 schema does not provide |
| **BLOCKED BY MISSING STITCH** | V5 surface has no dedicated Stitch desktop/mobile pair |

---

## Demo readiness verdict

**Growth is ready for demo testing** of implemented multi-branch HQ + Foundation-retained surfaces, with known exclusions.

| Ready | Surface |
|-------|---------|
| Yes | Apex commercial (pricing SoT: USD 14.99 / active branch / month; HQ not billed; members not billed) |
| Yes | Tenant public + member + branch-admin Foundation ops |
| Yes | HQ shell, branch directory/selector, cross-branch members/registrations/content/forms/requests/announcements |
| Yes | HQ basic reports hub (Foundation + Growth) |
| Yes | Advanced attendance **and** giving detail (`advanced_reports`) |
| No | Catalogue aspirational Growth (surveys, appointments, volunteer scheduling, offline attendance, scheduled broadcasts/reports) — **DEFERRED**, not sold as live |
| No | Network custom domain / mailboxes / API / webhooks / managed services — **NOT_IN_SCOPE** |

Do **not** demo Network features or catalogue-aspirational Growth as live product.

---

## Growth commercial rules (verified)

| Rule | Evidence | Status |
|------|----------|--------|
| USD 14.99 per active branch / month | `003_blessboard_plans.sql`, `platformPricingContent.js` (`GROWTH_MONTHLY_PER_BRANCH_CENTS`) | Pass |
| HQ is not billed as a branch | Pricing / FAQ copy SoT | Pass |
| Unlimited branches | `max_branches` null on Growth plan; soft capacity | Pass (hard wire into all provision CLIs still soft — ops note) |
| Members not billed individually | Pricing / FAQ SoT | Pass |
| Network-only excluded | `custom_domain` / `custom_email` false on Growth; Network catalogue rows `NOT_IN_SCOPE` | Pass |

---

## Entitlement verification

| Check | Result | Evidence |
|-------|--------|----------|
| 1. Growth entitlement gates | **Pass** | `advanced_reports` gates `/hq/reports/attendance` (FG-08a) and `/hq/reports/giving` (FG-Q12 this audit); hub cards show Growth-required chrome on Foundation |
| 2. Foundation cannot access Growth-only detail | **Pass** | Foundation HQ gets honest 200 denial empty-states on attendance + giving detail; hub snapshot remains; no detail aggregates leaked |
| 3. Multi-branch selectors preserve church scope | **Pass** | `resolveBlessBoardBranchForChurch` + `listBlessBoardBranches(churchId)`; foreign branch key → 404; `branch-list` + reports filter tests |
| 4. Reports use real existing data only | **Pass** | `hqReportsService` / attendance / giving aggregates from live tables; `reports-audit` asserts real giving `25.50` |
| 5. No fabricated analytics / forecasts | **Pass** | Templates + tests forbid `chart.js`, `<canvas`, `projectedGrowth`, YoY / trend % |
| 6. Desktop/mobile vs Stitch | **Pass within limits** | Canonical pairs cited below; MATCHED not claimed without browser side-by-side |
| 7. Safe GUI defects fixed | **Done** | Giving `advanced_reports` gate mirrored from attendance; hub card labels; CSS `hq-admin.css?v=47` |

---

## Screen classifications

### A. Growth-differentiated HQ surfaces

| Screen | Desktop Stitch | Mobile Stitch | Classification | Notes |
|--------|----------------|---------------|----------------|-------|
| HQ shell / dashboard | `538c8f4f…` | `c67eda76…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Soft KPIs intentional; no fabricated charts |
| Branch directory | `1a1aaecd…` | `2f154dfc…` | **CLOSE PARITY** | Unlimited active branches on Growth; create not in UI |
| Branch selector | (registry / filters) | same | **CLOSE PARITY** | Church-scoped active branches only |
| Cross-branch members | `3dae337c…` (28-*) | `e90963b0…` | **CLOSE PARITY** | Church-wide directory; no Export/Add |
| Member detail (HQ) | adapted 27-* | — | **MINOR GAPS** / **BLOCKED BY MISSING STITCH** | Read-only privacy-limited |
| Cross-branch registrations | `87fe9bb7…` | `d352ed07…` | **CLOSE PARITY** | Read-only HQ queue; approve on BA |
| Registration detail (HQ) | — | — | **MINOR GAPS** / **BLOCKED BY MISSING STITCH** | Breadcrumb + read-only |
| Public content oversight | `3f316066…` | `f2bb5e79…` | **MINOR GAPS** | CMS oversight ≠ freeform builder |
| Forms / resources / requests (HQ) | reused pairs | mobiles | **CLOSE PARITY** / **BLOCKED BY DATA** | Shared with Foundation CMS |
| Announcements / broadcast (HQ) | `ffa76443…` | `b4184b73…` | **CLOSE PARITY** | No schedule/SMS (DEFERRED) |
| Basic reports hub | `2a577dc1…` | `06489c79…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live snapshot; no generators |
| Advanced attendance report | `2a577dc1…` | `06489c79…` | **CLOSE PARITY** / **BLOCKED BY DATA** | `advanced_reports` gated |
| Advanced giving report | `2a577dc1…` | `06489c79…` | **CLOSE PARITY** / **BLOCKED BY DATA** | `advanced_reports` gated (FG-Q12 closed this audit) |
| Branch performance Stitch | `f6b63697…` | `922867ae…` | **CLOSE PARITY** / **BLOCKED BY DATA** | No separate route; hub + honest unavailable |
| Audit trail | `bce1e8ec…` | `d7fcb1b3…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Append-only; no CSV/compliance scores |
| HQ account / settings | — | — | **BLOCKED BY MISSING STITCH** | Live identity/settings chrome |

### B. Foundation surfaces retained by Growth

Classifications inherit portal audits (CLOSE / MINOR / BLOCKED BY DATA / MISSING STITCH). Growth does not remove Foundation CMS, BA ops, member portal, or public tenant.

| Area | Classification summary | Source audit |
|------|------------------------|--------------|
| Apex marketing + auth | CLOSE / MISSING_STITCH (auth-error, account) | Coverage + FG queue |
| Tenant public | CLOSE PARITY | `TENANT_PUBLIC_PARITY_AUDIT.md` |
| Member portal | CLOSE / MINOR; prayer dedicated route MISSING_BACKEND | `MEMBER_PORTAL_PARITY_AUDIT.md` |
| Branch admin | CLOSE / MINOR / MISSING_STITCH (account, settings, sermons, forms) | `BRANCH_ADMIN_PARITY_AUDIT.md` |
| BA basic monthly reports | **BLOCKED BY DATA** / MISSING_BACKEND | Nav disabled; V4 not ported |

### C. Explicitly out of Growth demo scope

| Item | Class | Why |
|------|-------|-----|
| Custom domain / mailboxes / API / webhooks | NOT_IN_SCOPE | Network-only |
| Surveys / appointments / volunteers / offline attendance / scheduled reports & broadcasts | DEFERRED | Catalogue aspirational; no V5 schema/routes |
| Leader portal / departments / duty roster / monthly report workflow / HQ roles UI | MISSING_BACKEND or NOT_IN_SCOPE | Coverage rows 65–68, 78 |
| Create organization GUI | BLOCKED BY VERIFIED DEPENDENCY | CLI-only (`/admin/organizations/new` absent) |

---

## Summary counts (Growth-audited product surfaces in §A)

| Class | Count |
|-------|------:|
| CLOSE PARITY | 14 |
| MINOR GAPS | 3 |
| MATERIAL GAPS | 0 |
| BLOCKED BY DATA (partial, shared with CLOSE) | 8 |
| BLOCKED BY MISSING STITCH | 3 |

No **MATERIAL GAPS** on backend-ready Growth screens.

---

## Fixes applied this audit (safe GUI / entitlement only)

| Fix | Files |
|-----|-------|
| Soft `advanced_reports` gate on `/hq/reports/giving` (mirror FG-08a attendance) | `hqReportsRoutes.js` |
| Foundation denial empty-state + Stitch analytics chrome on giving detail | `hq/giving-report.ejs` |
| Hub giving card Growth-required labels / gated chrome | `hq/reports.ejs` |
| Denied-state CSS + cache bump `hq-admin.css?v=47` | `hq-admin.css`, shell/error CSS refs |
| Foundation denial + Growth entitlement assertions | `blessboard-reports-audit.test.js`, `blessboard-v5-a11y-structure.test.js` |

**Preserved:** routes, schema, CSRF, HQ authz, church scoping, live aggregates only, Network exclusions, no fabricated metrics.

---

## Accessibility checklist (Growth HQ)

| Check | Status |
|-------|--------|
| Skip → `#bb-hq-main` | Pass |
| Landmarks / headings | Pass |
| Focus-visible on report cards / filters | Pass |
| Form labels on month/branch filters | Pass |
| Empty / entitlement-denied states | Pass (attendance + giving) |
| Contrast (Sacred Modernity) | Pass |
| `prefers-reduced-motion` | Pass |
| Desktop tables + mobile cards (&lt;900px) | Pass |

---

## Intentional Stitch omissions (do not “fix”)

- Fabricated dashboard KPIs, charts, forecasts, YoY trends  
- Donor PII, bank reconciliation, CSV/PDF exports on giving  
- Individual check-in / QR analytics on attendance  
- HQ registration approve/reject (branch-owned)  
- Announcement scheduling / SMS  
- Website builder canvas / org templates  
- Branch create UI; `max_branches` hard-fail in every provision path (ops soft)  
- Network domains, mailboxes, API, webhooks  

---

## Tests run

All commands run 2026-07-19 on `V5` @ `de660d3` + FG-Q12 gate fix. Exit code **0** unless noted.

| Command | Result |
|---------|--------|
| `npm run test:platform:entitlements` | **10/10 pass** |
| `npm run test:blessboard:authorization` | **22/22 pass** |
| `npm run test:blessboard:hq-shell` | **9/9 pass** |
| `npm run test:blessboard:branch-list` | **2/2 pass** |
| `npm run test:blessboard:reports-audit` | **7/7 pass** (Foundation denial + Growth unlock for attendance **and** giving) |
| `npm run test:blessboard:a11y-structure` | **87/87 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (246 `color-no-hex` warnings pre-existing) |
| `git diff --check` | **clean** |

**Totals this run:** **137** focused tests pass / **0** fail (entitlements + authz + HQ shell + branch scope + reports + a11y).

---

## Remaining gaps (acceptable for Growth demo)

1. Visual **MATCHED** not claimed without browser↔Stitch side-by-side.  
2. Public content oversight remains form/CMS editors, not Stitch freeform builder.  
3. HQ Account / Settings / Member detail / Registration detail lack dedicated HQ Stitch pairs.  
4. `max_branches` hard enforcement not wired into all provision CLIs (soft capacity).  
5. Catalogue-aspirational Growth features remain DEFERRED — do not present as live.

**Platform Admin / Network:** not started from this audit.
