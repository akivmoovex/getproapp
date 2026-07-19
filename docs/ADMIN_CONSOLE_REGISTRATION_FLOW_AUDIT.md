# BlessBoard V5 — Admin Console & Registration-Flow Audit

**Task:** PROMPT 1 OF 5 (analysis only)  
**Date:** 2026-07-19  
**Canonical domain:** blessboard.org (V5 foundation mode, testing)  
**Database inspected:** `DATABASE_URL` → identity `blessboard-platform-v5` / `environment_code=testing`  
**Scope:** Read-only code + schema inspection. No application, migration, route, UI, or data changes.

---

## 1. Executive verdict

**Overall: CONSOLIDATION REQUIRED**

| Area | Verdict |
|------|---------|
| V5 platform-admin shell (orgs, plans, domains, deployments) | **EXTEND EXISTING** — solid, tested, production-reachable on apex |
| Church-registration applications (`blessboard.platform_church_registration_applications`) | **Lead/enquiry queue only** — public write path complete; **no admin review UI** |
| Instant Free-plan / self-serve provisioning | **MOSTLY MISSING** as an HTTP flow; **CLI services exist** and must be reused, not duplicated |
| Onboarding / follow-up / call notes | **MOSTLY MISSING** as first-class org onboarding (only unused `review_notes` + status on applications) |
| Path-based tenancy (`/c/:slug`, etc.) | **ABSENT** — tenancy is hostname/`platform.domains` only |
| V4 inquiry admin + `provisionChurchOrganization` | **LEGACY ONLY — do not reuse** on foundation DB |

Future Free-plan work should **extend** V5 PA Organizations + CLI provisioning + the applications table/repo, **not** recreate parallel “Churches / Applications / Leads” consoles or call V4 `public.church_*` provisioning.

---

## 2. Current platform-admin route inventory

**Mount:** `src/platform/http/v5FoundationServer.js` → `createPlatformAdminRouter`  
**Route file:** `src/platform/http/platformAdminRoutes.js`  
**Role:** `platform_admin` on `blessboard.user_roles` + apex host  
**Primary tests:** `tests/blessboard-platform-admin-shell.test.js`

| Route | Method | Handler | Service / repo | View | Nav label | Role | Tables (primary) | Main actions | Status | Prod-reachable (apex) | Tests |
|-------|--------|---------|----------------|------|-----------|------|------------------|--------------|--------|----------------------|-------|
| `/admin` | GET | inline | `getPlatformAdminDashboardStats`, `listPlatformOrganizations` | `platform-admin/dashboard.ejs` | Dashboard | `platform_admin` | `platform.organizations`, `blessboard.churches` | View counts, sample orgs, quick links | PARTIAL (KPI placeholders) | Yes | Yes |
| `/admin/account` | GET | inline | env deployment code | `account.ejs` | Account | same | — | Identity display, logout | COMPLETE | Yes | Yes |
| `/admin/logout` | POST | inline | `revokeV5Session` | redirect `/login` | — | Apex + CSRF (no role gate) | `platform.deployment_sessions` | Sign out | COMPLETE | Yes | Yes |
| `/admin/organizations` | GET | inline | `listPlatformOrganizations` | `organizations.ejs` | Organizations | same | orgs, products, domains, churches, branches | Search (key prefix), paginate, open detail | COMPLETE (read-only; no create) | Yes | Yes |
| `/admin/organizations/:organizationKey` | GET | inline | `getPlatformOrganizationSummary`, entitlements view | `organization-detail.ejs` | (from Orgs) | same | + plans, subscriptions, entitlements | View catalogue, branches, plan/usage | COMPLETE (read + plan UI) | Yes | Yes |
| `/admin/organizations/:organizationKey/plan` | POST | inline | `assignOrganizationPlanByKey` | — | — | same | `organization_subscriptions` | Assign plan (CSRF + confirm) | COMPLETE | Yes | Yes |
| `/admin/organizations/:organizationKey/entitlement-override` | POST | inline | `setOrganizationEntitlementOverrideByKey` | — | — | same | `organization_entitlements` | Override feature (CSRF + confirm) | COMPLETE | Yes | Yes |
| `/admin/plans` | GET | inline | `listPlatformPlansCatalogue` | `plans.ejs` | Plans | same | `platform.plans`, `plan_features` | Read catalogue | COMPLETE (no editor) | Yes | Yes |
| `/admin/subscriptions` | GET | inline | `listPlatformSubscriptions` | `subscriptions.ejs` | Subscriptions | same | `organization_subscriptions` | Filter/paginate | COMPLETE (read-only) | Yes | Yes |
| `/admin/domains` | GET | inline | `listPlatformDomains` | `domains.ejs` | Domains | same | `platform.domains` | Filter/paginate | COMPLETE (no DNS automation) | Yes | Yes |
| `/admin/domains/:hostname` | GET | inline | `getPlatformDomainDetail` | `domain-detail.ejs` | (from Domains) | same | domains, orgs | View domain | COMPLETE | Yes | Yes |
| `/admin/domains/:hostname/status` | POST | inline | `updatePlatformDomainStatus` | — | — | same | `platform.domains` | Set status | COMPLETE | Yes | Yes |
| `/admin/domains/:hostname/organization` | POST | inline | `assignPlatformDomainOrganization` | — | — | same | `platform.domains` | Assign org | COMPLETE | Yes | Yes |
| `/admin/deployments` | GET | inline | `listPlatformDeployments` | `deployments.ejs` | Deployments | same | `platform.deployments` | List | COMPLETE (no ops control) | Yes | Yes |
| `/admin/deployments/:deploymentCode` | GET | inline | `getPlatformDeploymentDetail` | `deployment-detail.ejs` | (from Deployments) | same | deployments, domains | Diagnostics (safe) | COMPLETE | Yes | Yes |
| `/admin/settings` | GET | inline | deployments + reserved slugs | `settings.ejs` | Settings | same | — | Read-only patterns | PARTIAL | Yes | Yes |

**Explicitly absent (V5):**

| Capability | Status |
|------------|--------|
| `GET /admin/organizations/new` (Stitch 64) | MISSING — CLI only |
| Registration applications queue | MISSING — no route |
| Onboarding / follow-up / support notes UI | MISSING |
| Org create / edit / suspend / delete UI | MISSING |
| Impersonation / password reset | MISSING |
| Billing / tickets / health automation | PLACEHOLDER / out of scope |

**Legacy (not V5 platform-admin):** `/admin/church/*`, `/admin/churches/new`, `/admin/church/platform-inquiries` under church-admin / V4 stacks. Live testing V5 DB has **no** `public.church_platform_inquiries` / `public.church_organizations`.

---

## 3. Dashboard inventory

Source: `views/blessboard/v5/platform-admin/dashboard.ejs` + `platformAdminRepository.countOrganizationDirectoryStats`.

| Display label | Type | Route / component | Data source | Real / static / placeholder | V5-compatible | Duplicates elsewhere? | Reuse for proposed metrics? |
|---------------|------|-------------------|-------------|----------------------------|---------------|----------------------|------------------------------|
| Organizations | Metric card | `/admin` → `/admin/organizations` | `COUNT(platform.organizations)` | **Real** | Yes | Org directory total | **New churches** only if filtered by `created_at` (not today) |
| BlessBoard churches | Metric card | same | `COUNT(blessboard.churches)` | **Real** | Yes | Overlaps org enrolment | Same — needs date filters |
| Branch tenants | Metric card | — | — | **Placeholder** (`—`) | N/A | Detail page has live branch count | Not until metric defined |
| Paid plans | Metric card (desktop) | `/admin/plans` | — | **Placeholder** | N/A | Subscriptions list is live | No |
| Open tickets | Metric card (desktop) | `/admin/deployments` | — | **Placeholder** | N/A | None | Could confuse with **follow-up** — do not overload |
| System health | Metric card (mobile) | — | — | **Placeholder** | N/A | Deployment diagnostics | No |
| Deployment notices | Alert | — | env code only | **Static empty** | Yes | — | No |
| Directory sample (≤5) | List | org detail links | `listOrganizationDirectoryPage` | **Real** | Yes | Org directory | Partial stand-in for “recent orgs” |
| Recent activity | Panel | — | — | **Placeholder empty** | N/A | — | Do not invent |
| Platform health | Panel | — | — | **Placeholder empty** | N/A | — | No |
| Quick actions | Links | Orgs / Plans / Deployments / Settings | static | **Static** | Yes | Nav duplicates | Low risk |
| Charts / queues | — | — | — | **None** | — | — | — |

### Overlap with proposed future dashboard items

| Proposed item | Existing overlap | Gap |
|---------------|------------------|-----|
| New churches today / this week | Org/church **totals only** | No `created_at` window cards |
| Awaiting first call | None | Apps `status='pending'` unused in UI |
| Unverified administrators | None in PA | No email-verify model in V5 auth |
| Onboarding incomplete | None | No onboarding % table |
| Website unpublished | None in PA | `blessboard.public_pages.status` exists but not surfaced here |
| Published churches | None in PA | Same |
| Suspended churches | Org/church `status` stored; directory shows status | No dedicated suspended filter/card |

**Do not add new cards until date-filtered queries and applications queue exist; prefer extending Organizations + a future Applications surface over inventing ticket KPIs.**

---

## 4. Admin navigation map

Source: `src/platform/http/platformAdminNav.js` + shell partials.

| Label | Destination | Desktop | Mobile | Route status | Duplicated? | Feature-flagged? | Legacy? |
|-------|-------------|---------|--------|--------------|-------------|------------------|---------|
| Dashboard | `/admin` | Sidebar | Bottom “Home” | Live | No | No | No |
| Organizations | `/admin/organizations` | Sidebar | Bottom “Orgs” | Live | Quick action also | No | No |
| Plans | `/admin/plans` | Sidebar | Bottom “Plans” | Live | Quick “Plans & limits” | No | No |
| Subscriptions | `/admin/subscriptions` | Sidebar | Drawer only | Live | No | No | No |
| Domains | `/admin/domains` | Sidebar | Drawer only | Live | No | No | No |
| Deployments | `/admin/deployments` | Sidebar | Drawer only | Live | Quick action | No | No |
| Settings | `/admin/settings` | Sidebar | Drawer only | Live | Quick action | No | No |
| Account | `/admin/account` | Sidebar | Bottom + header | Live | Mobile quick | No | No |
| Sign out | `POST /admin/logout` | Sidebar | Drawer | Live | Account page | No | No |

**Not in nav (and no route):** Registrations, Applications, Onboarding, Follow-up, New Churches, Inquiries.

**Duplicate-label risk (future):** Adding both “Organizations” and “Churches” for the same `platform.organizations` + `blessboard.churches` join would duplicate the existing Organizations directory. Prefer one label (**Organizations**) with church enrolment columns.

**Dead-link risk:** Stitch map still lists `/admin/organizations/new` as expected — **route absent** (documented MISSING).

---

## 5. Organization / church management capabilities

**Canonical V5 term (recommendation only — do not rename yet):** **Organization** (`platform.organizations.organization_key`) with linked **Church** (`blessboard.churches`) and **Branches**. UI already says “Organizations” / “BlessBoard churches”. Avoid introducing “tenant” as a user-facing synonym of organization (used for branch/host concepts).

| Capability | Classification | Notes |
|------------|----------------|-------|
| List all organizations | COMPLETE | `/admin/organizations` |
| Search organizations | PARTIAL | Org-key **prefix** only (`q`) |
| Filter by status | MISSING | Status shown; no filter control |
| Open organization details | COMPLETE | `/admin/organizations/:organizationKey` |
| View organization administrators | MISSING | Users/roles not listed in PA |
| View branches | COMPLETE | Catalogue on org detail |
| View plan | COMPLETE | Subscription + entitlements |
| View registration date | PARTIAL | Org `created_at` may exist in DB; not emphasized as “registration” |
| View verification status | PARTIAL | Domain `verified_at` only; not admin email verify |
| View publication status | MISSING | `public_pages` not in PA |
| Suspend organization | MISSING (UI) | Status enums exist on org/church; no PA action |
| Reactivate organization | MISSING | Same |
| Edit organization | MISSING | CLI / other surfaces |
| Provision organization | BACKEND-BLOCKED (GUI) | CLI `platform:tenant:provision` etc. |
| Delete organization | MISSING | — |
| See audit history | PARTIAL | `platform.audit_events` exists; no PA browser |
| Impersonate church | MISSING | — |
| Reset administrator password | MISSING | CLI user create only |
| Resend invitation / verification | MISSING | No V5 invite/verify |
| See onboarding status | MISSING | — |
| See last activity | MISSING | — |

---

## 6. Registration-application implementation

### Table

| Item | Detail |
|------|--------|
| Migration | `db/migrations/blessboard/026_create_platform_church_registration_applications.sql` |
| Schema | `blessboard.platform_church_registration_applications` |
| In ordered runner | Yes — applied on testing DB `2026-07-19T18:34:04.889Z` |
| Purpose (header) | Pending review only; **does not** provision |

**Columns:** `id`, `status`, `church_name`, `country`, `city`, `contact_name`, `contact_email`, `contact_phone`, `role_in_church`, `branch_name`, `branch_count`, `selected_plan`, `message`, `consent_terms`, `review_notes`, `source_ip`, `user_agent`, `created_at`, `updated_at`

**Status values:** `pending` \| `contacted` \| `closed`  
**Plan codes:** `foundation` \| `growth` \| `network` (app aliases `free`/`basic`/`basic_free` → store `foundation`)

**Indexes:** `(status, created_at DESC)`, `(lower(contact_email), created_at DESC)`  
**FK to org/church:** **None**

### Public flow

| Item | Detail |
|------|--------|
| GET | `/register-church` — `apexMarketingRoutes.js` → `register-church.ejs` |
| POST | `/register-church` — CSRF + rate limit → validate → insert |
| Validation | `platformChurchRegistrationValidation.js` |
| Service | `platformChurchRegistrationService.js` — honeypot; 15‑min email+church duplicate idempotency; **never provisions** |
| Repo | `platformChurchRegistrationRepository.js` — schema-qualified; exports `insert`, `listApplications`, `countPending` |
| Success | `303 ?submitted=1` |
| Errors | Validation re-render; DB errors → friendly 503 |
| Tests | `tests/blessboard-register-church.test.js` (+ marketing/smoke) |

### Admin consumption

| Item | Detail |
|------|--------|
| Admin route reading table | **None** |
| Admin screen | **None** |
| Approve / reject / contact / provision service | **None** (status/`review_notes` unused in write path) |
| Link application → organization | **None** |
| Duplicate protection | Soft idempotency (15‑min same email+church); not unique DB constraint |

**Classification of table today:** **Lead / application queue only** (not an onboarding queue, not an approval→provision source of truth, not linked to orgs). Closest to an unfinished hybrid because `status`/`review_notes` anticipate review that was never built.

**Live DB (testing):** 2 rows, both `status=pending`. Matches migration definition.

---

## 7. Existing registration-review screens

| Match | Classification | Location |
|-------|----------------|----------|
| Apex Register Your Church | **Live V5** | `/register-church` |
| `listApplications` / `countPending` | **Dormant V5** (repo only; no HTTP) | `platformChurchRegistrationRepository.js` |
| Platform inquiries admin | **Legacy V4 only** | `/admin/church/platform-inquiries` → `public.church_platform_inquiries` — **table absent on V5 testing DB** |
| HQ/BA “Registrations” | **Live V5 tenant** — **member** applications | `/hq/registrations`, `/branch-admin/registrations` |
| GetPro CRM Leads | **Unrelated** | `/admin/leads` |
| Stitch Create Organization (64) | **Stitch + docs; route MISSING** | Map row 76 |
| Docs onboarding | **Docs only** | e.g. `docs/blessboard-church-onboarding.md` (subdomain/V4 oriented) |

**Where does the admin currently see pending church registrations?**  
**Nowhere in V5 platform-admin.** Pending rows exist only in SQL / logs / public form success path.

---

## 8. Onboarding and follow-up data inventory

| Concept | Exists? | Where | Level |
|---------|---------|-------|-------|
| Application status / review_notes | Yes (unused writes) | `platform_church_registration_applications` | Application |
| Member registration review_notes | Yes | `member_registrations` | Member (different domain) |
| Public page publication | Yes | `public_pages.status` (`draft`/`published`/`archived`) | Branch/church content |
| Church/branch lifecycle status | Yes | `churches.status`, `branches.status` (`active`/`inactive`/`suspended`/`archived`) | Org/church/branch |
| Domain verified_at | Yes | `platform.domains` | Domain |
| Onboarding % / checklist | **No** | — | — |
| Assigned support agent | **No** (V5) | V4 had `church_platform_support_notes` — **absent** on V5 DB | — |
| Follow-up / callback dates | **No** | — | — |
| First/last contacted | **No** | — | — |
| Setup completed date | **No** | — | — |
| Church-facing onboarding UI | **No** dedicated V5 | Branch website editor exists as content tool, not PA onboarding | — |
| Admin onboarding UI | **No** | — | — |

**Naming conflicts:** “Registrations” means **member** queues in HQ/BA, not church applications. “Onboarding” in V4 branch seed (`branchOnboardingService`) is website seed, not Free-plan portal checklist.

---

## 9. Existing provisioning logic

### A. V5-safe CLI chain (reuse for future orchestration)

| Step | Entry | Creates | Files |
|------|-------|---------|-------|
| 1 | `npm run platform:tenant:provision` | `platform.organizations`, enrolment, domain, default plan subscription | `provisionPlatformTenant.js`, `platformProvisioningRepository.js`, `db/scripts/platform-tenant-provision.js` |
| 2 | `npm run blessboard:church:provision` | `blessboard.churches` + HQ branch | `provisionBlessBoardChurch.js`, `blessboard-church-provision.js` |
| 3 | `npm run blessboard:user:create` | `blessboard.users` | `createBlessBoardUser.js` |
| 4 | `npm run blessboard:user:role:assign` | `blessboard.user_roles` | `assignBlessBoardRole.js` |
| Optional | PA UI | Plan assign / entitlement override | `platformAdminRoutes.js` |

- Each step has its own transaction; **no single atomic HTTP orchestrator**.
- Dry-run default; `--confirm` for writes; identity checks.
- Demo dataset may call tenant provision without users.
- **Production reachable via ops CLI**, not via `/register-church`.

**Reusable V5 provisioning service:** `provisionPlatformTenant` + `provisionBlessBoardChurch` + user/role services — **yes**, but not one self-registration API.

### B. V4 GUI (do not reuse on foundation)

| Entry | Creates | File |
|-------|---------|------|
| `POST /admin/church/organizations` (`/admin/churches/new`) | Org + branch + admins + website seed in one TX into `public.church_*` | `platformProvisioningRepo.provisionChurchOrganization` |

**Highest risk:** Implementing instant Free-plan by copying V4 `provisionChurchOrganization` or dual-writing legacy inquiries.

### C. Register-church

Never provisions (V5 or V4 enquiry paths).

---

## 10. Authentication and portal-entry flow (V5)

| Piece | Behavior |
|-------|----------|
| Login | Apex `GET/POST /login`; tenant hosts use auth transfer |
| Session | `platform.deployment_sessions` + host-only cookie |
| Users | `blessboard.users` + `authenticateBlessBoardUser` |
| Password hashing | Existing BlessBoard user hashing in create/auth services |
| Email verification / invitation / temp-password UX | **Not implemented** in V5 |
| Apex post-login | `/account` |
| Tenant redeem default | `/branch-admin` |
| HQ | `/hq/*` |
| Member | `/member` |
| Suspended/inactive | Enforced via org/enrolment/church/branch status in tenant routing |

**Smallest existing first portal screen after provisioning:** **`/branch-admin`** (branch-admin dashboard). Do not invent a new portal dashboard for v1 Free-plan access.

**Live testing note:** `blessboard.users` count = **0** (1 org / 1 church / 1 branch exist without login users).

---

## 11. Path-based tenancy readiness

| Check | Result |
|-------|--------|
| Routes `/c/:slug`, `/church/:slug`, `/org/:slug`, etc. | **ABSENT** |
| Slug resolution for path tenants | **ABSENT** |
| Host-based routing | **Present** — `resolveHostname` + `evaluateTenantRoute` (`off` / `shadow` / `authoritative`) |
| Middleware assumptions | Hostname → domain → org → church → branch |
| URL helpers / subdomain links | Domain catalogue + reserved slug settings; Growth V4 uses `/branches/:slug` (legacy) |
| Tests for path-based church access | **None** for `/c/:slug` |

**Classification: ABSENT** (and would **CONFLICT WITH HOST ROUTING** if both models are enabled without a single resolver strategy). Tenant routing is currently **off** in foundation deployment context — do not enable in this audit.

---

## 12. Stitch and screen-map comparison

Sources: `docs/gui/STITCH_SCREEN_MAP.md`, `docs/gui/PLATFORM_ADMIN_PARITY_AUDIT.md`, `docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md`.

| Stitch / map | Expected | Implemented | Status note |
|--------------|----------|-------------|-------------|
| 62 Dashboard | `/admin` | Yes | PARTIAL — live counts; tickets/health blocked by data |
| 63 Organizations | `/admin/organizations` | Yes | PARTIAL — no create/export |
| 64 Create organization | `/admin/organizations/new` | **No** | MISSING — CLI only |
| 65 Org detail / branch tenants | `/admin/organizations/:key` | Yes | PARTIAL |
| 66 Plans | `/admin/plans` | Yes | PARTIAL |
| 67 Settings (+ Domains adapted) | `/admin/settings`, `/admin/domains*` | Yes | PARTIAL |
| Deployments (80/80a) | `/admin/deployments*` | Yes | PARTIAL |
| Register Your Church (apex) | `/register-church` | Yes | PARTIAL — enquiry only |
| Church registration **admin review** | — | **No Stitch PA screen mapped** | Docs/product gap |
| Member registrations | HQ/BA | Yes | Different product surface |

**Stale risk:** Map still implies create-org GUI; dashboard “tickets” chrome exists visually as unavailable placeholders — do not treat as follow-up queue.

---

## 13. Live database verification (read-only)

**Identity:** `blessboard-platform-v5` / `testing`  
**Migrations:** `026_create_platform_church_registration_applications.sql` applied; checksum present  
**Applications table:** columns/constraints/indexes match repo migration  
**Counts:** applications pending=2; orgs=1; churches=1; branches=1; users=0  

**Present (relevant):**  
`platform.organizations`, `organization_*`, `plans`, `domains`, `deployments`, `deployment_sessions`, `audit_events`, `auth_transfers`, `schema_migrations`  
`blessboard.churches`, `branches`, `users`, `user_roles`, `public_pages`, `member_registrations`, `platform_church_registration_applications`, …

**Absent on live V5 DB (legacy):**  
`public.church_platform_inquiries`, `public.church_organizations`, `public.church_platform_support_notes`

**Onboarding-like columns found:** `review_notes` (applications + member/ministry), `domains.verified_at` — no dedicated onboarding/follow-up tables.

**Discrepancy:** Repo + live schema aligned for applications. Functional gap is **application code** (no admin consumer), not migration drift.

---

## 14. Duplication-risk matrix

| Proposed feature | Existing equivalent | Reusable route | Reusable service | Reusable table | Reusable UI | Overlap | Risk | Future action |
|------------------|---------------------|----------------|------------------|----------------|-------------|---------|------|---------------|
| New Registrations admin tab | None (V5); V4 inquiries | — | `listApplications`/`countPending` | applications | PA shell | Member “Registrations” naming | **HIGH** | **BUILD NEW** under PA shell; never reuse V4 inquiries |
| All Churches list | Organizations directory | `/admin/organizations` | `listPlatformOrganizations` | orgs+churches | `organizations.ejs` | “Churches” vs “Organizations” | **MEDIUM** | **EXTEND** Orgs; avoid second list |
| Needs Follow-up tab | Apps `status` unused | — | — | applications.status | — | Ticket KPI placeholder | **MEDIUM** | **EXTEND** applications statuses |
| Onboarding tab | None | — | — | — | — | Branch website editor | **HIGH** | **DEFER** or **BUILD NEW** after model decision |
| Published tab | `public_pages` | Tenant content admin | content services | `public_pages` | Not in PA | — | **MEDIUM** | **EXTEND** org detail or content summary |
| Suspended tab | status columns | Orgs list | repo | churches/orgs.status | Partial display | — | **LOW** | **EXTEND** filter on Orgs |
| Registration details | None | — | repo SELECT | applications | — | V4 inquiry detail | **HIGH** | **BUILD NEW** V5-only |
| Follow-up notes | `review_notes` column | — | — | applications.review_notes | — | Member review_notes | **MEDIUM** | **EXTEND** column + write API |
| Assigned support person | None | — | — | — | — | V4 support notes | **MEDIUM** | **DEFER** / owner decision |
| Onboarding progress | None | — | — | — | — | — | **LOW** (greenfield) | **BUILD NEW** after schema decision |
| Instant Free-plan provisioning | CLI chain | — | `provisionPlatformTenant` + church/user/role | platform + blessboard | Stitch 64 missing | V4 one-shot provision | **HIGH** | **EXTEND** orchestrate CLIs; **REPLACE** never V4 |
| Church portal onboarding checklist | None | `/branch-admin` entry | — | — | BA shell | — | **MEDIUM** | **EXTEND** BA; don’t new portal |
| Path-based church website | Host routing only | — | `resolveHostname` | `platform.domains` | Tenant public | Host mode conflict | **HIGH** | **BUILD NEW** carefully or **DEFER** |
| Path-based church portal | Same | `/branch-admin` after transfer | auth transfer | sessions | — | Same | **HIGH** | Same |

---

## 15. Reusable components and services

| Asset | Reuse |
|-------|--------|
| Platform-admin shell / nav / CSRF / apex gate | REUSE |
| Organizations directory + detail + plan assign | EXTEND |
| `platformChurchRegistrationRepository.listApplications` / `countPending` | EXTEND (wire to new routes) |
| Validation + public register form | REUSE |
| `provisionPlatformTenant`, `provisionBlessBoardChurch`, user create/role assign | EXTEND into orchestrator |
| `entitlementService` / plan assign | REUSE (Foundation plan) |
| Branch-admin as first login destination | REUSE |
| Dashboard metric **card component pattern** | REUSE pattern; populate with real queries only |
| V4 inquiries UI / `provisionChurchOrganization` | **DO NOT REUSE** |

---

## 16. Missing capabilities (for desired Foundation flow)

1. Admin UI to list/filter/update church registration applications  
2. Link application → provisioned organization  
3. Instant Free-plan HTTP provisioning (atomic or saga over CLI services)  
4. Provisional portal credentials / invite / verification  
5. Forced unpublished public website until setup complete  
6. Onboarding checklist + progress for church admins  
7. Follow-up assignment, first-call, last-contacted fields (beyond raw `review_notes`)  
8. Dashboard cards: new today/week, awaiting call, unpublished, etc.  
9. Path-based `/c/:slug` (or chosen prefix) tenancy  
10. Org search beyond key prefix; status filters; suspend actions in PA  

---

## 17. Conflicting implementations

1. **V5 applications table vs V4 inquiries admin** — different schemas; V4 UI cannot see V5 rows.  
2. **V5 multi-CLI provision vs V4 single TX `provisionChurchOrganization`**.  
3. **Hostname tenancy vs proposed path tenancy** without a unified resolver.  
4. **“Registrations”** = member queues in HQ/BA vs church applications.  
5. **Stitch Create Org (64)** vs intentional CLI-only decision docs.  
6. **Dashboard “Open tickets”** placeholder vs future follow-up queue (semantic collision).

---

## 18. Legacy-only code that must not be reused

- `src/db/pg/church/platformProvisioningRepo.js` (`provisionChurchOrganization`)  
- `src/routes/admin/adminChurchPlatform.js` / churches new form  
- `src/routes/admin/adminChurchPlatformInquiries.js` + `views/admin/church/platform_inquir*`  
- `public.church_platform_inquiries`, `public.church_organizations`, `public.church_platform_support_notes`  
- Legacy platform admin shell under `views/partials/platform_admin_shell_*` / `views/admin/church/*`  
- GetPro `/admin/leads` CRM  

---

## 19. Recommended implementation boundaries (no implementation)

1. Keep **one** PA Organizations surface; add filters/columns rather than a parallel “All Churches” app.  
2. Add a **new** PA Applications (or Registrations) surface wired only to `blessboard.platform_church_registration_applications`.  
3. Instant Free-plan must **orchestrate existing V5 provision services**, not fork V4.  
4. First admin portal = existing **`/branch-admin`**.  
5. Path tenancy is a **separate design decision**; do not enable `BLESSBOARD_TENANT_ROUTING_MODE` or invent `/c/:slug` in the same change as review UI without an owner decision.  
6. Do not overload dashboard ticket/health placeholders as onboarding metrics.  
7. Extend `review_notes`/`status` before inventing parallel note tables, unless multi-agent assignment requires a new model (owner decision).  

---

## 20. Questions / uncertainties requiring owner decision

1. Should Free-plan self-registration **auto-provision** or remain enquiry-first with optional provision?  
2. Canonical public URL model without wildcard DNS: path prefix (`/c/:slug`), query, or manual subdomain per church?  
3. Should “unpublished until setup” mean all `public_pages` draft, domain inactive, or a new org flag?  
4. Is `review_notes` + `pending|contacted|closed` enough for call tracking, or are agent assignment + timestamps required?  
5. Password delivery: CLI-style set password, email invite (not built), or one-time temp password?  
6. Role for first Free-plan admin: `branch_admin`, `church_hq_admin`, or both?  
7. Keep Stitch 64 create-org GUI deferred forever, or reopen for ops (not self-serve)?  
8. Should dashboard “Open tickets” be removed/relabeled before a follow-up queue ships?  
9. Naming: admin nav label **Applications** vs **Church registrations** (to avoid clash with member Registrations)?  
10. Are the 2 pending applications in testing disposable test data or real leads?

---

## Appendix A — File index (V5)

- Routes: `src/platform/http/platformAdminRoutes.js`, `src/blessboard/http/apexMarketingRoutes.js`  
- Nav/shell: `platformAdminNav.js`, `views/blessboard/v5/partials/platform-admin-shell-*.ejs`  
- Registration: `platformChurchRegistration*.js`, migration `026_…sql`  
- Provision: `src/platform/services/provisionPlatformTenant.js`, `src/blessboard/services/provisionBlessBoardChurch.js`, user/role services + `db/scripts/*`  
- Docs: this file; `docs/gui/STITCH_SCREEN_MAP.md`; `docs/gui/PLATFORM_ADMIN_PARITY_AUDIT.md`; `docs/product/PLATFORM_CREATE_ORGANIZATION_GUI_DECISION.md`

## Appendix B — Audit constraints confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed (SELECT-only)  
- No routes added  
- No dashboard items added  
- No V4 code changed  
