# BlessBoard V5 — Route inventory and dead-link audit

**Date:** 2026-07-19
**Constraint:** Presentation / route-reference audit only. No product features, no new routes created because a link existed, no tenant-routing / auth-flow changes, no schema or env changes.
**Companions:** [`V5_FULL_GUI_REGRESSION_AUDIT.md`](../gui/V5_FULL_GUI_REGRESSION_AUDIT.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md) · [`V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Primary navigation hrefs match registered V5 GET routes? | **YES** |
| Dead `href="#"` / `javascript:` navigation found? | **NO** (in-page `#fragment` skip links only) |
| Incorrect static POST form targets found? | **NO** |
| Missing CSRF on V5 POST forms? | **NO** |
| V4 path hrefs (`/church…`, `/hq/dashboard`, `/member/dashboard`, `/hq/login`) in V5 EJS? | **NO** |
| Safe presentation / reference fixes applied? | **YES** (2) |

**Expanded inventory size:** **310** Method+Path patterns after expanding HQ/branch mount prefixes for announcements, participation, attendance, giving, forms/resources/requests, and content-admin (including media JSON/binary helpers).

---

## 2. Audit method

1. Listed routers mounted from `src/platform/http/v5FoundationServer.js` + `src/blessboard/http/*Routes.js` + `src/platform/http/platformAdminRoutes.js`.
2. Expanded variant mounts (`/hq/…`, `/hq/…/b/:branchKey`, `/branch-admin/…`).
3. Compared enabled nav models (`branchAdminNav`, `hqAdminNav`, `memberPortalNav`, `platformAdminNav`, `tenantPublicPaths`, apex marketing links).
4. Scanned all `views/blessboard/v5/**/*.ejs` for `href`, POST `action`, CSRF, placeholders, V4 prefixes.
5. Spot-checked `public/blessboard/v5/*.js` (media picker uses configured `mediaBase` only).
6. Fixed only clear, safe presentation/reference defects.
7. Added `tests/blessboard-v5-route-link-audit.test.js` + `npm run test:blessboard:route-link-audit`.

---

## 3. Route inventory (primary surfaces)

Status legend: **OK** · **INTENTIONAL** (empty/disabled UI without href) · **DEFERRED** (product omission)

Host type: **apex** · **tenant** · **both** (path exists; behaviour gated by host)

Access shorthand: **anon** · **session** · **member** · **branch_admin** · **hq** · **platform_admin**

### 3.1 Apex

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| apex | GET | `/` | apex | anon | `v5FoundationServer` | `apex/home.ejs` | apex nav / marketing | OK |
| apex | GET | `/features` | apex | anon | `apexMarketingRoutes` | `apex/features.ejs` | apex nav | OK |
| apex | GET | `/for-churches` | apex | anon | `apexMarketingRoutes` | `apex/for-churches.ejs` | apex nav | OK |
| apex | GET | `/pricing` | apex | anon | `apexMarketingRoutes` | `apex/pricing.ejs` | apex nav | OK |
| apex | GET | `/directory` | apex | anon | `apexMarketingRoutes` | `apex/directory.ejs` | apex nav | OK |
| apex | GET | `/register-church` | apex | anon | `apexMarketingRoutes` | `apex/register-church.ejs` | apex nav / CTAs | OK (enquiry UI; no provision POST) |
| apex | GET | `/login` | both | anon | `v5FoundationServer` | `apex/login.ejs` | apex + tenant Sign in | OK |
| apex | POST | `/login` | both | anon | `v5FoundationServer` | `apex/login.ejs` | form (no action → current URL) | OK |
| apex | POST | `/logout` | both | session | `v5FoundationServer` | shells / account | logout forms | OK |
| apex | GET | `/account` | both | session | `v5FoundationServer` | `apex/account.ejs` | apex nav | OK |
| apex | GET | `/auth/callback` | tenant | anon | `v5FoundationServer` | redirect / `apex/auth-error.ejs` | transfer | OK |
| apex | GET | `/healthz` | both | anon | `v5FoundationServer` | JSON/text | ops | OK |

Marketing CTAs (`/register-church`, `/pricing`, `/directory`, `/login`, `/account`) stay on apex and match registered routes. Pricing CTA is enquiry-only (no checkout).

### 3.2 Tenant public

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| tenant public | GET | `/` `/about` `/leadership` `/ministries` `/events` `/sermons` `/contact` `/giving` | tenant | anon | `tenantPublicRoutes` | `public/page.ejs` | `tenantPublicPaths.NAV_ITEMS` | OK |
| tenant public | GET | `/register` | tenant | anon | `tenantRegistrationRoutes` | `public/register.ejs` | public CTA | OK |
| tenant public | POST | `/register` | tenant | anon | `tenantRegistrationRoutes` | register / redirect | form | OK |
| tenant public | GET | `/register/submitted` | tenant | anon | `tenantRegistrationRoutes` | `public/register-submitted.ejs` | post-register | OK |
| tenant public | GET | `/login` | tenant | anon | `v5FoundationServer` | transfer redirect | Sign in | OK |

### 3.3 Tenant authentication

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| tenant authentication | GET | `/login` | tenant → apex transfer | anon | `v5FoundationServer` | apex login | public / portals | OK |
| tenant authentication | GET | `/auth/callback` | tenant | anon | `v5FoundationServer` | redirect / auth-error | transfer | OK |
| tenant authentication | POST | `/logout` | tenant | session | `v5FoundationServer` | account / shells | logout | OK |

Apex `/account` on **apex** host does **not** link `/hq` or `/branch-admin` (hostKind gate). On **tenant** host those links appear.

### 3.4 Member portal

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| member portal | GET | `/member` | tenant | member | `memberPortalRoutes` | `member/dashboard.ejs` | `PORTAL_NAV` | OK |
| member portal | GET | `/member/announcements` (+ `/:id`) | tenant | member | `announcementMemberRoutes` | announcements/* | nav | OK |
| member portal | POST | `/member/announcements/:id/read` | tenant | member | `announcementMemberRoutes` | — | detail form | OK |
| member portal | GET | `/member/events` (+ `/:id`) | tenant | member | `participationMemberRoutes` | participation/* | nav | OK |
| member portal | POST | `/member/events/:id/register\|cancel` | tenant | member | `participationMemberRoutes` | — | detail forms | OK |
| member portal | GET | `/member/ministries` (+ `/:id`) | tenant | member | `participationMemberRoutes` | participation/* | nav | OK |
| member portal | POST | `/member/ministries/:id/join\|leave` | tenant | member | `participationMemberRoutes` | — | detail forms | OK |
| member portal | GET | `/member/resources` (+ `/:id`, `/file`) | tenant | member | `formsRequestsMemberRoutes` | forms-requests/* | nav | OK |
| member portal | GET | `/member/forms` (+ `/:id`, submissions) | tenant | member | `formsRequestsMemberRoutes` | forms-requests/* | nav | OK |
| member portal | POST | `/member/forms/:id/submit` | tenant | member | `formsRequestsMemberRoutes` | — | form | OK |
| member portal | GET/POST | `/member/requests` (+ `new`, `/:id`, file) | tenant | member | `formsRequestsMemberRoutes` | forms-requests/* | nav | OK |
| member portal | GET | `/member/giving` | tenant | member | `memberPortalRoutes` | `member/giving.ejs` | nav | OK |
| member portal | GET/POST | `/member/profile` | tenant | member | `memberPortalRoutes` | `member/profile.ejs` | nav | OK |
| member portal | POST | `/member/logout` | tenant | member | `memberPortalRoutes` | shell | logout | OK |
| member portal | — | `/member/prayer` | — | — | — | — | disabled module | DEFERRED (no route; no href) |

Mobile bottom tabs are a **subset** of side nav (home, announcements, events, ministries, profile) — intentional.

### 3.5 Branch administration

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| branch administration | GET | `/branch-admin` | tenant | branch_admin | `branchAdminRoutes` | `branch-admin/dashboard.ejs` | `BRANCH_ADMIN_NAV` | OK |
| branch administration | GET/POST | `/branch-admin/settings` | tenant | branch_admin | `branchAdminRoutes` | settings | nav | OK |
| branch administration | GET | `/branch-admin/account` | tenant | branch_admin | `branchAdminRoutes` | account | nav | OK |
| branch administration | POST | `/branch-admin/logout` | tenant | branch_admin | `branchAdminRoutes` | shell | logout | OK |
| branch administration | GET | `/branch-admin/registrations` (+ detail) | tenant | branch_admin | `branchRegistrationAdminRoutes` | registrations* | nav | OK |
| branch administration | POST | `…/approve` `…/reject` | tenant | branch_admin | `branchRegistrationAdminRoutes` | detail modals | forms | OK |
| branch administration | GET | `/branch-admin/members` (+ `/:id`) | tenant | branch_admin | `branchRegistrationAdminRoutes` | members* | nav | OK |
| branch administration | GET/POST | `/branch-admin/announcements…` | tenant | branch_admin | `announcementAdminRoutes` | announcements/* | nav | OK |
| branch administration | GET/POST | `/branch-admin/participation…` | tenant | branch_admin | `participationAdminRoutes` | participation/* | nav | OK |
| branch administration | GET/POST | `/branch-admin/attendance…` | tenant | branch_admin | `attendanceAdminRoutes` | attendance/* | nav | OK |
| branch administration | GET/POST | `/branch-admin/giving…` | tenant | branch_admin | `givingAdminRoutes` | giving/* | nav | OK |
| branch administration | GET/POST | `/branch-admin/{resources\|forms\|requests}…` | tenant | branch_admin | `formsRequestsAdminRoutes` | forms-requests/* | nav | OK |
| branch administration | GET/POST | `/branch-admin/content…` (+ media) | tenant | branch_admin | `contentAdminRoutes` | content-admin/* | nav | OK |
| branch administration | — | Reports module tile | — | — | — | dashboard | `href: null` | INTENTIONAL disabled |

### 3.6 HQ administration

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| HQ administration | GET | `/hq` | tenant | hq | `hqAdminRoutes` | `hq/dashboard.ejs` | `HQ_ADMIN_NAV` | OK |
| HQ administration | GET | `/hq/branches` | tenant | hq | `hqAdminRoutes` | branches | nav | OK |
| HQ administration | GET | `/hq/branches/:branchKey` | tenant | hq | `hqAdminRoutes` | redirect → `/branch-admin` | branch jump | OK |
| HQ administration | GET/POST | `/hq/settings` | tenant | hq | `hqAdminRoutes` | settings | nav | OK |
| HQ administration | GET | `/hq/account` | tenant | hq | `hqAdminRoutes` | account | nav | OK |
| HQ administration | POST | `/hq/logout` | tenant | hq | `hqAdminRoutes` | shell | logout | OK |
| HQ administration | GET | `/hq/registrations` (+ detail) | tenant | hq | `hqMembersAdminRoutes` | hq/* | nav | OK |
| HQ administration | GET | `/hq/members` (+ `/:id`) | tenant | hq | `hqMembersAdminRoutes` | hq/* | nav | OK |
| HQ administration | GET | `/hq/reports` (+ attendance/giving) | tenant | hq | `hqReportsRoutes` | hq/* | nav | OK |
| HQ administration | GET | `/hq/audit` | tenant | hq | `hqReportsRoutes` | audit | nav | OK |
| HQ administration | GET/POST | `/hq/{announcements\|participation\|attendance\|giving\|resources\|forms\|requests\|content}…` | tenant | hq | *AdminRoutes | shared admin templates | nav | OK |
| HQ administration | GET/POST | `/hq/…/b/:branchKey/…` | tenant | hq | same | branch-scoped HQ | in-page scope | OK |

### 3.7 Platform administration

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| platform administration | GET | `/admin` | apex | platform_admin | `platformAdminRoutes` | dashboard | `PLATFORM_ADMIN_NAV` | OK |
| platform administration | GET | `/admin/organizations` (+ `/:organizationKey`) | apex | platform_admin | `platformAdminRoutes` | organizations* | nav | OK |
| platform administration | POST | `/admin/organizations/:organizationKey/plan` | apex | platform_admin | `platformAdminRoutes` | org detail | form | OK |
| platform administration | POST | `…/entitlement-override` | apex | platform_admin | `platformAdminRoutes` | org detail | form | OK |
| platform administration | GET | `/admin/plans` | apex | platform_admin | `platformAdminRoutes` | plans | nav | OK |
| platform administration | GET | `/admin/subscriptions` | apex | platform_admin | `platformAdminRoutes` | subscriptions | nav | OK |
| platform administration | GET | `/admin/domains` (+ `/:hostname`) | apex | platform_admin | `platformAdminRoutes` | domains* | nav | OK |
| platform administration | POST | `/admin/domains/:hostname/status\|organization` | apex | platform_admin | `platformAdminRoutes` | domain detail | forms | OK |
| platform administration | GET | `/admin/deployments` (+ `/:deploymentCode`) | apex | platform_admin | `platformAdminRoutes` | deployments* | nav | OK |
| platform administration | GET | `/admin/settings` | apex | platform_admin | `platformAdminRoutes` | settings | nav | OK |
| platform administration | GET | `/admin/account` | apex | platform_admin | `platformAdminRoutes` | account | nav | OK |
| platform administration | POST | `/admin/logout` | apex | session | `platformAdminRoutes` | shell | logout | OK |

No Create Organization nav link (`/admin/organizations/new`) — intentional (CLI provisioning).

### 3.8 Media workflows

| Area | Method | Route | Host type | Access | Route module | Template | Navigation source | Status |
|------|--------|-------|-----------|--------|--------------|----------|-------------------|--------|
| media workflows | GET | `/_bb/media/:assetId` | tenant | anon (public assets) | `publicMediaRoutes` | binary | public/member HTML | OK |
| media workflows | POST | `{P}/media/upload` | tenant | hq / branch_admin | `contentAdminRoutes` | JSON | media-picker.js | OK |
| media workflows | GET | `{P}/media` | tenant | hq / branch_admin | `contentAdminRoutes` | JSON | picker | OK |
| media workflows | GET | `{P}/media/:assetId` | tenant | hq / branch_admin | `contentAdminRoutes` | binary | picker | OK |
| media workflows | POST | `{P}/media/:assetId/archive` | tenant | hq / branch_admin | `contentAdminRoutes` | JSON | picker | OK |

`{P}` ∈ `/hq/content`, `/hq/content/b/:branchKey`, `/branch-admin/content`.

---

## 4. Findings checklist

| Check | Result |
|-------|--------|
| Links to unregistered routes (primary nav) | **None** |
| Incorrect route prefixes | **None** in enabled nav |
| Apex host linking tenant portals | **OK** — account page hostKind-gated |
| Tenant host requiring apex auth | **OK** — `/login` transfers; no tenant password form |
| Obsolete V4 paths in V5 `href` | **None** (`/church/images/…` asset `src` only — not navigation) |
| Placeholder `href="#"` | **None** bare; fragments for skip/in-page only |
| `javascript:` links | **None** |
| Buttons styled as links without actions | Disabled / unavailable controls use `<button disabled>` or `<article>` / `<span>` — OK |
| Forms targeting missing POST routes | **None** for static actions; dynamic `<%= … %>` actions follow registered patterns |
| Logout forms incorrect targets | **None** — `/logout`, `/admin/logout`, `/hq/logout`, `/branch-admin/logout`, `/member/logout` |
| Missing CSRF on state-changing forms | **None** in V5 EJS POST forms |
| Incorrect active-nav rules | **OK** — `activeNav === item.key` across shells |
| Missing return links | Spot-check OK on detail pages (`Back to…`) |
| Broken pagination | List pages use keyed query builders; shared partial no longer defaults to `#` |
| Unsafe UUID query IDs | **None** — branch/org keys in path or `branch=` slug filters |
| Marketing CTAs to unsupported workflows | Register-church enquiry only; no live checkout CTA |

---

## 5. Safe fixes made

| Fix | File | Why safe |
|-----|------|----------|
| HQ dashboard: live module cards with deferred KPIs are links **without** `is-unavailable`; only href-less cards use `<article class="is-unavailable">` | `views/blessboard/v5/hq/dashboard.ejs` | Matches branch-admin pattern; destinations already registered; no route/auth change |
| Shared pagination: require non-empty `baseHref`; do not default to `#` | `views/blessboard/v5/partials/pagination.ejs` | Partial unused today; prevents future dead `#` pages |

---

## 6. Items requiring product decisions

| Item | Notes |
|------|-------|
| Member mobile bottom-nav subset | Side nav includes resources/forms/requests/giving; bottom tabs do not. Confirm intentional for Stitch. |
| External URLs from CMS (`actionUrl`, `externalUrl`, `directionsUrl`, `apexHref`) | Allowlisted at render time in some modules; keep host allowlisting policy explicit. |
| `tenant-landing.ejs` copy | Mentions portals “not available yet” while portals exist under authoritative mode — update when landing surface is product-confirmed. |
| Wire or delete unused `pagination.ejs` | Now safe if included; list pages still use inline pagers. |
| Directory `visit_href` | Built from branch slug public URL helper — depends on directory data; empty when not single-branch. |

---

## 7. Automated coverage

| Suite | Command | Purpose |
|-------|---------|---------|
| Route + link audit (new) | `npm run test:blessboard:route-link-audit` | Primary nav ↔ routes; no `#`/`javascript:`/V4 hrefs; POST CSRF + static actions; logout targets; HQ/pagination/account host gates |
| Navigation / shells | `test:blessboard:{branch-admin,hq,platform-admin}-shell`, `member-portal`, `a11y-structure` | Shell href presence |
| Auth transfer | `npm run test:blessboard:tenant-auth` | Tenant login → apex transfer |
| CSRF structure | Route-link audit POST CSRF scan (+ existing church CSRF inventories remain V4-scoped) | V5 form CSRF |

---

## 8. Suggested commit message

```
Audit V5 routes and nav links; harden HQ stats and pagination hrefs.
```
