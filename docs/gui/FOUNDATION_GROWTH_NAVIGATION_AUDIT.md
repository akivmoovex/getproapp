# Foundation & Growth — navigation audit

**Date:** 2026-07-19  
**Branch:** `V5`  
**Prompt:** 29 — Integrate navigation for retained features  
**Mode:** Audit + nav wiring only — **stop after navigation**  
**Stitch project:** `projects/17124191473876947591`

---

## Canonical Stitch references (shell / nav chrome)

| Surface | Stitch titles | Screen IDs (desktop / mobile) | V5 marker |
|---------|---------------|-------------------------------|-----------|
| Member shell | `14-member-dashboard-*` | `4207a5a6…` / `b315a9d1…` | `data-bb-stitch-shell` via member shell |
| Branch admin shell | `25-branch-admin-dashboard-*` | `001d1a02…` / `615f1f4e…` | Batch 11A |
| HQ shell | `51-hq-dashboard-*` | `538c8f4f…` / `c67eda76…` | `data-bb-stitch-shell="51-hq-dashboard"` |
| HQ permissions | `59-hq-permission-role-management-*` | `12f5be53…` / `de3e82ef…` | `data-bb-stitch-roles="59-…"` |
| Platform admin shell | `62-platform-admin-dashboard-*` | `36c4708b…` / `513dd5cc…` | Batch 19A |
| HQ reports hub | `57-hq-consolidated-analytics-*` | `2a577dc1…` / `06489c79…` | reports markers |

**Grouped nav:** Stitch HQ mocks include aspirational items (Broadcasts, etc.) and occasional section chrome. V5 keeps a **flat enabled-route list** in sidebar + drawer (same pattern as Batches 08A / 11A / 16A / 19A). No fabricated group headers. Deferred Stitch modules stay **absent**, not disabled stubs in primary nav.

---

## Nav models (source of truth)

| Actor | Model | Mobile bottom tabs | Dashboard quick actions |
|-------|--------|--------------------|-------------------------|
| Member | `memberPortalNav.js` | home, announcements, events, ministries, profile (5) | Giving, Ministries, Events; **Prayer** disabled |
| Branch admin | `branchAdminNav.js` | home, registrations, members, announcements, account (5) | Module grid from `BRANCH_ADMIN_MODULES` |
| HQ | `hqAdminNav.js` | home, branches, reports, account (4) | Desktop: branches, registrations, **Permissions**, reports; Mobile: branches, members, reports, announce |
| Platform admin | `platformAdminNav.js` | home, organizations, plans, account (4) | organizations, plans, deployments (existing) |

Active states: shells set `activeNav` / `data-bb-page`; sidebar and bottom tabs compare `item.key === activeNav`.

---

## Retained / live routes in navigation

| Route | Surfaces | Notes |
|-------|----------|-------|
| `/member/*` live modules | Member nav + modules | No `/member/prayer` or `/member/prayer-request` |
| `/branch-admin/*` live modules | BA nav + modules | Reports **not** in primary nav |
| `/hq` … `/hq/audit`, `/hq/roles`, … | HQ nav + drawer | Permissions → `/hq/roles` (BB-02) |
| `/hq/reports` | HQ nav + bottom tab + quick | Foundation hub OK |
| `/hq/reports/attendance`, `/hq/reports/giving` | **Growth/Network hub cards only** | Route still denies Foundation without aggregates |
| `/admin/*` enabled set | Platform nav | No Tenants / Tickets / Health |

---

## Intentionally absent or disabled

| Item | Treatment | Wording / reason |
|------|-----------|------------------|
| Broadcasts / org templates | Absent from HQ nav | Deferred; Stitch mock only |
| Branch monthly reports | Disabled dashboard tile only | “Monthly reports not available yet” |
| Dedicated member Prayer tile | Disabled quick action + module | “Not enabled yet”; live path is **Requests** (`/member/requests`) — no confidential pastoral queue for members beyond own requests |
| Pastoral / prayer **admin** specialty nav | Absent | No pastoral role; BA/HQ use **Requests** under staff roles |
| Leader portal | Absent | Not in V5 role model |
| Departments / duty roster / surveys / appointments / volunteers / offline attendance | Absent | Gate-stop deferred |
| Growth detail report links on Foundation | **Non-link** gated cards | “Requires Growth — not linked on Foundation” |

---

## Changes in this pass

1. **HQ reports hub** — Foundation no longer receives `href` to `/hq/reports/attendance` or `/giving`; Growth/Network keep entitled links. Route denial remains the hard gate.
2. **HQ dashboard** — Desktop quick actions include **Permissions** (`/hq/roles`); Audit removed from the four-slot desktop strip (Audit stays in sidebar/drawer). Mobile quick strip unchanged (4 items; Permissions via drawer).
3. **HQ shell locals** — `roles` → page title “Permissions”.
4. **Branch reports placeholder** — Blurb clarified; dashboard uses module blurb for disabled tiles.
5. **Route-link audit** — Registers `hqRoleAdminRoutes.js`.
6. **HQ shell test** — Expects `/hq/roles` + Permissions quick action; no longer forbids “Permission”; still forbids Broadcast / templates / fabricated metrics.
7. **CSS** — Gated non-anchor report cards; `hq-admin.css?v=49`.

---

## Confidentiality / entitlement rules (nav)

| Rule | Result |
|------|--------|
| Do not expose Growth-only **links** to Foundation | **Pass** after hub change |
| Do not expose pastoral/prayer queues to unauthorized roles | **Pass** — no pastoral role; member prayer CTA stays disabled; staff use Requests with existing authz |
| Nav hiding is not sole protection | **Pass** — advanced reports still route-gated |
| Do not overcrowd mobile bottom nav | **Pass** — member/BA ≤5, HQ/platform ≤4; full sets in drawer |
| Active states preserved | **Pass** — including `activeNav: "roles"` |

---

## Verification

| Check | Command / result |
|-------|------------------|
| Route/link audit | `npm run test:blessboard:route-link-audit` — **9/9 pass** |
| Entitlements | `npm run test:platform:entitlements` — **13/13 pass** |
| A11y structure | `npm run test:blessboard:a11y-structure` — **88/88 pass** |
| HQ shell | `npm run test:blessboard:hq-shell` — **9/9 pass** |
| Reports + Growth hub links | `npm run test:blessboard:reports-audit` — **7/7 pass** |
| HQ roles | `node --test --test-concurrency=1 tests/blessboard-hq-roles.test.js` — **10/10 pass** |
| Diff hygiene | `git diff --check` — clean |

---

## Stop

Navigation integration complete. **Do not start** the next feature batch from this prompt.
