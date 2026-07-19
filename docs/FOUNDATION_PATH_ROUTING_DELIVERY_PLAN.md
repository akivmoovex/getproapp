# Foundation Path Routing & Delivery Plan (Prompt 2D)

**Status:** Architecture decision — analysis only  
**Date:** 2026-07-19  
**Inputs:**
- [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
- [`docs/FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md)
- [`docs/FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md`](./FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md)
- [`docs/FOUNDATION_PROVISIONING_ARCHITECTURE.md`](./FOUNDATION_PROVISIONING_ARCHITECTURE.md)

**Constraints:** No code, routes, migrations, data, dashboards, or V4 changes in this prompt.  
**Context:** Wildcard DNS unavailable; host-based tenant routing exists but is off/partial; path-based access is required for Foundation.

---

## 1. Executive recommendation

| Surface | Chosen pattern |
|---------|----------------|
| **Public church website** | **`/c/:slug`** (+ nested page paths) |
| **Church admin portal** | **`/c/:slug/branch-admin`** (nest existing portal under slug) |
| **Central login** | Existing apex **`/login`** with `next=` return to path portal |
| **First screen after provision** | Existing **branch-admin dashboard** at `/c/:slug/branch-admin` |
| **URL building** | One **`churchUrlHelper`** abstraction (path / subdomain / custom) |
| **First implementation prompt** | **Phase 1 — Schema/status consolidation** |

Do **not** introduce a second login system, a second portal shell, or scatter hardcoded `/c/` strings across EJS.

---

## 2. Route pattern evaluation

### 2.1 Public website

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| **`/c/:slug`** | Short; clear namespace; low collision with marketing routes; “c” = church | Slightly cryptic | **Choose** |
| `/church/:slug` | Readable | Longer; `church` already in reserved org slugs (confusion); looks like marketing | Reject as primary |
| `/churches/:slug` | Plural catalogue feel | Collides semantically with future directory; longer | Reject |

**Public tree (target):**

```text
/c/:slug                  → home (or unpublished gate)
/c/:slug/about
/c/:slug/events
…                         → same page keys as tenant public paths today
```

Reuse `tenantPublicPaths` / public page renderer under path context instead of duplicating templates.

### 2.2 Portal

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| `/portal` (session-only org) | Short | Multi-org ambiguous; weak bookmarks | Reject as sole entry |
| `/churches/:slug/portal` | Explicit | New shell name; duplicates “portal” vs existing `/branch-admin` | Reject |
| `/organizations/:slug/portal` | Matches PA term | Public says “Church”; long | Reject |
| **`/c/:slug/branch-admin`** | Reuses existing portal routes/screens; slug in URL; multi-org safe | Requires allowing portal on **apex** with path context (today: apex rejected) | **Choose** |
| `/c/:slug/hq`, `/c/:slug/member` | Same pattern later | Out of Foundation minimum | Defer mount |

**Portal entry convenience:** `GET /c/:slug/portal` → **303** to `/c/:slug/branch-admin` (bookmark-friendly alias only).

### 2.3 Collision prevention

Apex marketing and platform routes that must remain **outside** `/c/:slug`:

`/`, `/features`, `/for-churches`, `/pricing`, `/directory`, `/register-church`, `/terms`, `/privacy`, `/login`, `/logout`, `/account`, `/admin/*`, `/healthz`, `/auth/*`, static `/blessboard/*`

**Reserved path prefixes** (never usable as `:slug`, and reserved as org keys where applicable):

- Existing `ORGANIZATION_RESERVED_SLUGS` (`admin`, `login`, `register`, `www`, `church`, `hq`, `branch`, `member`, …)
- **Add for path mode:** `c`, `portal`, `account`, `auth`, `healthz`, `assets`, `blessboard`, `api`, `organizations`, `registration-applications` (and other PA segments)

Slug = canonical **`organization_key`** (same key used in provision). Church key may equal org key on Foundation.

---

## 3. Resolution, middleware, and auth

### 3.1 Slug resolution

```text
slug → platform.organizations.organization_key
    → require active org + active BlessBoard enrolment
    → blessboard.churches (1:1)
    → primary HQ branch
    → attach req.blessBoardPathContext { organization, church, branch, slug, routingMode: 'path' }
```

Inactive / missing / unpublished policy:

- **Portal:** 404 or 403 if no role; suspended church blocked.  
- **Public:** if site `unpublished`, show minimal “not published” page (not full site) unless preview entitlement later.

### 3.2 Organization context middleware

| Middleware | Role |
|------------|------|
| `resolvePathChurchContext` | Parse `/c/:slug…`; load catalogue; 404 if invalid |
| `requirePathChurchAccess` | Portal: session user must have role on that org/church/branch |
| Host resolver (existing) | Remains for subdomain/custom; **single** downstream tenant context shape |

**Unify context shape** so public/portal code consumes one object whether resolved via path, subdomain, or custom domain.

### 3.3 Login approach

| Step | Behavior |
|------|----------|
| Unauthenticated portal hit | `303 /login?next=/c/{slug}/branch-admin` |
| Apex `/login` POST success | Honor safe `next` (same-origin path only; must start with `/c/` or allowlisted portal paths) |
| No `next` | Existing apex `/account` |
| Multi-org user | After login, if `next` present go there if authorized; else **`/account`** (or future org chooser) listing orgs with links to `/c/:slug/branch-admin` |
| Tenant-host transfer | Keep existing `/auth/callback` for subdomain/custom; path mode does not require transfer |

**Do not** create a second password store or cookie name.

### 3.4 Authorization

Reuse `authorizeBlessBoardTenantAccess` / role lists with **path context org ids** instead of host-derived tenant only.

Platform admin (`/admin`) stays apex-global — **not** under `/c/:slug`.

### 3.5 Canonical URL helper

New module (conceptual): `src/blessboard/urls/churchUrlHelper.js`

```js
buildChurchPublicUrl({ slug, pagePath, routing })
buildChurchPortalUrl({ slug, portal: 'branch-admin'|'hq'|'member', pathSuffix, routing })
```

`routing` resolution order:

1. If org has **active custom domain** and entitled → `https://{custom}/…`  
2. Else if **subdomain** mode enabled and DNS present → `https://{slug}.{base}/…`  
3. Else **path** → `https://blessboard.org/c/{slug}/…`

EJS and emails call **only** the helper (or locals injected from it).

### 3.6 Future path → subdomain / custom-domain

| Phase | Behavior |
|-------|----------|
| Foundation | Path canonical |
| Later subdomain | Helper emits subdomain; optional **301** from `/c/:slug` → subdomain when flag on |
| Custom domain | Helper prefers custom; path URL may 301 to custom primary |

Host-based `evaluateTenantRoute` and path resolver must share “active church” rules so enabling authoritative host mode does not fork product logic.

### 3.7 Custom-domain compatibility

- Provision may **skip** domain insert (per 2C).  
- When a domain is later assigned in PA, helper switches mode without changing slug.  
- Path routes remain as fallback bookmarks during migration.

---

## 4. First portal experience

| Item | Choice |
|------|--------|
| Smallest existing screen | **`/branch-admin` dashboard** (existing EJS/shell) |
| Path URL | `/c/:slug/branch-admin` |
| After provision | Login → that URL |
| Setup checklist | **Phase 6** — banner/partial on same dashboard or minimal `/c/:slug/branch-admin/setup` — not a new product shell |
| Website preview | Link via helper to `/c/:slug` (unpublished gate until publish) |
| Leave and return | Bookmark path URL; session cookie on apex host |

**Required for Foundation:** path context on apex + auth gate + existing dashboard.  
**Deferred:** full onboarding wizard, HQ/member path mounts, impersonation.

---

## 5. Admin / dashboard (routing-adjacent)

Per 2A/2B: applications at `/admin/registration-applications`; orgs remain `/admin/organizations`.  
Dashboard metric cards wait until Phase 8; prefer filters/links to applications and orgs over inventing ticket KPIs.

---

## 6. Highest routing risk

1. **Apex vs tenant split:** Today HQ/BA/public **reject apex**; path mode requires carefully opening apex **only** under `/c/:slug…` without exposing tenant portals at bare `/branch-admin` on apex (or define bare paths as 404 on apex).  
2. **Session host-only cookie** on `blessboard.org` is correct for path mode; do not weaken cookie to parent domain casually.  
3. **Dual resolution** (path + host) without one context builder → inconsistent auth.  
4. Enabling `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` while path is primary without a compatibility matrix.

---

## 7. Implementation sequence (future prompts)

Each phase is a separate Cursor prompt. Do not combine Phase 1–3 into one mega-change.

---

### Phase 1 — Schema / status consolidation

| | |
|--|--|
| **Objective** | Land 2B data model: application status split, `organization_id`, `organization_onboarding`, support notes |
| **Dependencies** | 2A/2B architecture approved |
| **Likely files** | New migrations under `db/migrations/blessboard/`; `platformChurchRegistrationRepository.js`; backfill script/tests |
| **Migrations** | **Yes** — applications columns; onboarding table; support_notes table; CHECKs/indexes |
| **Tests** | Migration/bootstrap; repo list/count; status constraint tests |
| **Rollback** | Revert migration (down or restore); no HTTP behavior change yet |
| **Exclusions** | No routes, orchestrator, path routing, dashboard cards, V4 |

---

### Phase 2 — Provisioning orchestrator

| | |
|--|--|
| **Objective** | `manageTransaction: false` on child services + `provisionRegisteredBlessBoardChurch` |
| **Dependencies** | Phase 1 (application provisioning fields + onboarding row) |
| **Likely files** | `provisionPlatformTenant.js`, `provisionBlessBoardChurch.js`, `createBlessBoardUser.js`, `assignBlessBoardRole.js`; new orchestrator service; optional `skipDomain` |
| **Migrations** | None (or tiny if idempotency columns needed) |
| **Tests** | Unit/integration: atomic success, failure rollback, idempotent retry, foundation→`free` map |
| **Rollback** | Feature flag / do not wire HTTP yet; CLI default TX mode unchanged |
| **Exclusions** | No public register auto-provision; no path routes; no PA UI; no V4 |

---

### Phase 3 — Instant Basic/Free registration

| | |
|--|--|
| **Objective** | `/register-church` POST validates → orchestrator → success with login CTA |
| **Dependencies** | Phase 2 |
| **Likely files** | `apexMarketingRoutes.js`, `platformChurchRegistrationService.js`, `register-church.ejs`, password field UX |
| **Migrations** | None expected |
| **Tests** | End-to-end register→org+user; duplicate email; plan alias; CSRF/rate limit preserved |
| **Rollback** | Flag `INSTANT_PROVISION_ENABLED=false` → enquiry-only insert |
| **Exclusions** | Path portal mount (may still login to `/account` until Phase 5); PA follow-up UI; dashboard |

---

### Phase 4 — Admin application and follow-up visibility

| | |
|--|--|
| **Objective** | `/admin/registration-applications` list/detail; org detail shows onboarding/follow-up; note + status actions |
| **Dependencies** | Phase 1; Phase 3 useful but apps can exist without instant provision |
| **Likely files** | `platformAdminRoutes.js`, `platformAdminNav.js`, new EJS under `platform-admin/`, services for follow-up updates |
| **Migrations** | None if Phase 1 complete |
| **Tests** | PA shell tests; CSRF actions; apex-only; role gate |
| **Rollback** | Remove nav link; routes 404 behind flag |
| **Exclusions** | Impersonation; Stitch create-org GUI; dashboard metric flood; V4 inquiries |

---

### Phase 5 — Path-based portal entry

| | |
|--|--|
| **Objective** | Resolve `/c/:slug/branch-admin*`; apex login `next=`; session auth against path context |
| **Dependencies** | Phase 2–3 (users exist); helper stub |
| **Likely files** | `v5FoundationServer.js`, `branchAdminRoutes.js` (apex path allow), new `resolvePathChurchContext.js`, `churchUrlHelper.js`, login next validation |
| **Migrations** | None |
| **Tests** | Path portal 200/403/404; apex bare `/branch-admin` stays closed; login next open-redirect negative tests |
| **Rollback** | Disable path router mount; login next ignore `/c/` |
| **Exclusions** | Public website pages; onboarding checklist UI; authoritative host mode changes; custom domain automation |

---

### Phase 6 — Minimal church onboarding experience

| | |
|--|--|
| **Objective** | Checklist banner or `/c/:slug/branch-admin/setup` updating `organization_onboarding` |
| **Dependencies** | Phase 1 + 5 |
| **Likely files** | Branch-admin views/partials; onboarding service |
| **Migrations** | None (checklist JSON only) |
| **Tests** | Progress transitions; permission; unpublished remains |
| **Rollback** | Hide partial via flag |
| **Exclusions** | Full marketing redesign; path public site polish; PA redesign |

---

### Phase 7 — Path-based public church website

| | |
|--|--|
| **Objective** | `/c/:slug` (+ pages) using existing public renderers; unpublished gate |
| **Dependencies** | Phase 5 helper; publication status from 2B |
| **Likely files** | `tenantPublicRoutes.js` or path wrapper; `tenantPublicPaths.js`; unpublished view |
| **Migrations** | None |
| **Tests** | Published vs unpublished; reserved slug; no leak of admin routes |
| **Rollback** | Unmount public path router |
| **Exclusions** | Wildcard DNS; forcing authoritative host mode; SEO mega-project |

---

### Phase 8 — Dashboard metrics and polish

| | |
|--|--|
| **Objective** | Real cards/filters: new orgs, awaiting follow-up, unpublished, suspended — sourced from onboarding/apps/orgs |
| **Dependencies** | Phases 1, 4, 7 data |
| **Likely files** | `dashboard.ejs`, `platformAdminRepository.js`, org list filters |
| **Migrations** | None |
| **Tests** | Metric accuracy; no placeholder ticket reuse |
| **Rollback** | Revert dashboard query only |
| **Exclusions** | Billing MRR; fake health; V4 |

---

## 8. Dependency graph

```text
Phase 1 schema
    ├── Phase 2 orchestrator
    │       └── Phase 3 instant registration
    ├── Phase 4 admin applications / follow-up
    └── Phase 5 path portal ──┬── Phase 6 onboarding UI
                              └── Phase 7 path public site
                                      └── Phase 8 dashboard polish
```

**First implementation prompt recommended:** **Phase 1 (Schema/status changes).**

Rationale: unlocks orchestrator, admin follow-up, and onboarding without routing complexity; matches 2B REQUIRED migrations; lowest product-visible risk if rolled back.

---

## 9. Decision log (2D)

| Decision | Chosen | Rejected | Reason |
|----------|--------|----------|--------|
| Public path | `/c/:slug` | `/church`, `/churches` | Namespace + brevity |
| Portal path | `/c/:slug/branch-admin` | bare `/portal`, new portal shell | Reuse existing portal |
| Login | Apex `/login` + safe `next` | Second auth system | Existing session |
| First screen | Branch-admin dashboard | New dashboard / account-only | Already exists |
| URL helper | Central `churchUrlHelper` | Hardcoded EJS paths | Subdomain/custom migration |
| Multi-org | Slug in URL + `/account` chooser | Session-only org | Bookmark + clarity |
| First build prompt | Phase 1 schema | Jump to path routing | Dependencies |

---

## 10. Explicit duplicate-prevention (routing)

- No second public site implementation beside path-wrapped tenant public.  
- No apex bare `/branch-admin` for Foundation (path-prefixed only) unless explicitly productized later.  
- No parallel `/organizations/:slug/portal`.  
- No V4 subdomain URL helpers in new EJS — use `churchUrlHelper` only.

---

## 11. Open owner decisions

1. Unpublished public URL: soft “coming soon” vs hard 404?  
2. Mount HQ/member under `/c/:slug` in Foundation or defer?  
3. When subdomain DNS appears: auto-301 from `/c/:slug` or wait for flag?  
4. Allow bare `/branch-admin` on apex if session has exactly one org? (Default: **no**)

---

## 12. Companion architecture index

| Doc | Topic |
|-----|-------|
| `ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md` | Current state |
| `FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md` | Org vs church vs applications |
| `FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md` | Status families |
| `FOUNDATION_PROVISIONING_ARCHITECTURE.md` | Orchestrator + Free plan |
| **This file** | Path routing + delivery phases |

---

## 13. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes added  
- No dashboard items added  
- No V4 code changed  
