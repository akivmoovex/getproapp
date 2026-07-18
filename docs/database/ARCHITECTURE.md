# BlessBoard database architecture

Clean multi-schema foundation for a shared PostgreSQL database used initially by BlessBoard V4 and V5. GetPro and NGO schemas are reserved empty shells for later products. This document is the source of truth for ownership and runtime rules.

## Physical topology

- **V4 (`blessboard.com`)** remains on the **legacy** PostgreSQL database (`public.*`, church schemas, `ensure*Schema`).
- **V5 (`blessboard.org`)** uses **only the new** platform foundation database (`DATABASE_URL`). Do not reconnect V5 to the legacy database. Do not use `GETPRO_DATABASE_URL` for V5.
- The new database is a clean multi-schema foundation (platform + product schemas). It does **not** receive copies of legacy `public` application tables (`tenants`, `session`, etc.).
- BlessBoard product catalogue tables live under `blessboard` only — not by recreating legacy `public` shapes.
- Do not modify the old/legacy database as part of this foundation work.

## V5 foundation startup mode (temporary)

When both are set:

- `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`
- `DEPLOYMENT_ENV=testing`

the HTTP process enters **V5 foundation mode** (`src/platform/config/v5FoundationMode.js` → `src/platform/http/v5FoundationServer.js`):

| Behavior | V5 foundation | V4 / legacy (`server.legacy.js`) |
|----------|---------------|----------------------------------|
| Database | `DATABASE_URL` only (new platform DB) | Legacy URL (`DATABASE_URL` or `GETPRO_DATABASE_URL`) |
| `public.tenants` / `public.session` | Never queried; must not exist | Required |
| `ensure*Schema` / runtime DDL | Skipped | Runs at boot |
| Legacy seeds / scheduled jobs | Skipped | As before |
| `/healthz` + apex `/` | 200 (foundation page) | Full product |
| Apex `/login`, `/logout`, `/account` | Available (deployment-scoped sessions) | Full product |
| Tenant-host login transfer | `GET /login` → apex → `GET /auth/callback` (host-only; no shared Domain) | Full product |
| Member / giving / CMS portals | Controlled 503 | Full product |
| Minimal HQ / branch-admin / platform-admin shells | Read-only shells when authorized | Full product |
| Platform host diagnostics | Optional (`PLATFORM_HOST_CONTEXT_MODE=diagnostic`); non-authoritative alone | Optional; non-authoritative |
| Tenant-host landing | Feature-flagged (`BLESSBOARD_TENANT_ROUTING_MODE`) | Full product |

Foundation mode serves apex auth with deployment-scoped sessions. Tenant-host content is **off by default** and becomes authoritative only when `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` after platform + catalogue gates pass. There is no legacy `public.tenants` fallback.

## Target schemas

| Schema | Ownership | Status |
|--------|-----------|--------|
| `platform` | Shared cross-product registry (migrations, identity, deployments, tenant catalogue) | Foundation + tenant catalogue |
| `blessboard` | BlessBoard product data | Catalogue + V5 users/roles |
| `getpro` | GetPro product data | Empty schema reserved |
| `ngo` | NGO product data | Empty schema reserved |
| `public` | No new application tables | Must remain free of new app DDL |
| `auth`, `storage`, `realtime`, `extensions` | Supabase-managed | Untouched — never modify |

## Schema ownership rules

1. **Application tables belong only in product or platform schemas.** Never create new application tables in `public`.
2. **Schema-qualified SQL is mandatory.** All new queries and migrations must use explicit qualifiers (`platform.deployments`, `blessboard.…`). Unqualified names are not allowed for application objects.
3. **Platform owns cross-cutting registry tables** (`schema_migrations`, `database_identity`, `deployments`, `products`, `organizations`, `organization_products`, `domains`, `plans`, `plan_features`, `organization_subscriptions`, `organization_entitlements`, `audit_events`). Product domains do not own these.
4. **BlessBoard owns BlessBoard product tables** under `blessboard` only. Current: `churches`, `branches`, `church_settings`, `branch_settings`, `users`, `user_roles`, plus public website content (`public_pages`, `page_sections`, `leaders`, `ministries`, `events`, `sermons`, `contact_channels`, `giving_methods`).
5. **GetPro and NGO** may only receive empty schema placeholders now. No product tables until those phases begin.
6. **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `extensions`) must not be altered by application migrations or scripts.
7. **V5 sessions** live in `platform.deployment_sessions` (token hash only, deployment-scoped). Never `public.session` / `connect-pg-simple` on V5.

## V5 apex authentication (deployment-scoped)

| Piece | Role |
|-------|------|
| `platform.deployment_sessions` | Session rows keyed by SHA-256 token hash + `deployment_code` |
| `platform.auth_transfers` | Short-lived single-use tenant login handoff (hash only; ≤5 minutes) |
| `blessboard.users` | Minimal login identity (bcrypt password hash) |
| `blessboard.user_roles` | `platform_admin` / `church_hq_admin` / `branch_admin` scopes |
| Cookie | `SESSION_COOKIE_NAME` (default `blessboard_org_v5_sid`); HttpOnly; Secure in production; SameSite=Lax; 12h |
| CSRF | Signed double-submit cookie (`v5c1…`) using `SESSION_SECRET` — independent of express-session |
| Routes | Apex: `GET/POST /login`, `POST /logout`, `GET /account`. Tenant: `GET /login` (initiate), `GET /auth/callback` (redeem), `POST /logout` |

### Tenant-host login transfer (no shared Domain cookie)

1. Tenant `GET /login` validates resolved platform + catalogue tenant → inserts `platform.auth_transfers` (pending; `user_id` null) → redirects to apex `/login?tr=…`.
2. Apex authenticates with CSRF; password never accepted on the tenant host.
3. Apex verifies active role for the transfer’s organization/church/branch UUIDs, then rotates the transfer to a redeem code and redirects to `https://{requested_hostname}/auth/callback?code=…`.
4. Tenant callback consumes the code (single-use), creates a **new** host-only `deployment_sessions` cookie, and never copies the apex cookie.
5. Expired, consumed, hostname-mismatched, or deployment-mismatched codes fail closed (400). Unauthorized roles → 403. DB errors → 503.

- Cookies are always **host-only** (no `Domain=.blessboard.org`). Apex and tenant jars are separate.
- Transfer query params (`tr`, `code`) are redacted from access logs; callback responses set `Referrer-Policy: no-referrer`.
- No user-supplied external redirect URLs; optional `next` is limited to `/hq`, `/branch-admin`, `/account` paths.
- No password reset, email verification, OAuth, MFA in this phase. Public member registration is host-scoped at `/register`.
- Provision users/roles explicitly via CLI — never at startup.

## Tenant routing mode (`BLESSBOARD_TENANT_ROUTING_MODE`)

| Mode | Behavior |
|------|----------|
| `off` (default) | Current foundation behavior. Tenant hosts do not render tenant content. |
| `shadow` | Resolve platform + catalogue; log `blessboard_tenant_route_shadow`; still serve foundation HTML (no tenant data in the browser). |
| `authoritative` | Valid active BlessBoard tenant hostname → read-only landing page. Failures → controlled 404/503. No legacy fallback. |

- Mode is **never** inferred from `NODE_ENV`, `DEPLOYMENT_ENV`, hostname, Git branch, or deployment code.
- Unsupported values safely fall back to `off`.
- Authoritative gates: valid `PLATFORM_DEPLOYMENT_CODE`, `resolved_tenant`, product `blessboard`, deployment match, active domain/product/org/enrolment, active church, active HQ + primary branches.
- Suggested HTTP policy: `unknown_domain` / `inactive_domain` / `deployment_mismatch` → **404**; inactive product/org/enrolment/church/branches and lookup errors → **503**. Browser pages stay generic (no internal reason codes).
- Tenant landing shows church + primary branch display names, optional HQ indicator, testing/demo env badge, “BlessBoard V5” marker, apex link — never UUIDs, deployment codes, roles, or diagnostics.
- `/healthz` remains available regardless of tenant routing outcome.
- V4 (`server.legacy.js`) is unchanged. `public.tenants` / `public.session` remain absent on V5.

## Tenant-scoped authorization (no portals yet)

| Piece | Role |
|-------|------|
| `authorizeBlessBoardTenantAccess` | UUID-scoped grant evaluation against resolved tenant |
| `loadBlessBoardAuthorizationContext` | Attaches `req.blessBoardAuthorizationContext` (fail-soft) |
| `requireBlessBoardTenantRole` | Fail-closed 401 / 403 / 503 for protected routes |
| `GET /tenant-access-check` | Temporary diagnostic only — not linked from nav |

Authorization context (compact; no raw rows):

```text
authenticated, authorized, userId, organizationId, churchId, branchId, effectiveRoles[]
```

Role rules (active users + active roles only):

| Role | Access |
|------|--------|
| `platform_admin` | Any active resolved BlessBoard tenant on this deployment (still requires resolved tenant; does not bypass inactive tenant gates) |
| `church_hq_admin` | Assigned church UUID + all active branches of that church |
| `branch_admin` | Assigned branch UUID only |

- Comparisons use **UUIDs**, never display names or slugs.
- Public tenant landing remains public; authorization failures must not crash it.
- Cookie stays **host-only** (no `Domain=.blessboard.org`). Sign in on the tenant hostname to reach HQ / branch-admin; apex cookies are not sent to tenant hosts.

## Minimal branch-admin portal shell

| Route | Behavior |
|-------|----------|
| `GET /branch-admin` | Authorized empty dashboard (placeholder cards only) |
| `GET /branch-admin/account` | Safe display name + role label + church/branch names |
| `POST /branch-admin/logout` | CSRF-required; clears host-only session; redirects to tenant `/` |

- Tenant + branch are derived from authoritative hostname context (primary branch). Query-string branch IDs are ignored.
- Roles: `branch_admin` (assigned branch), `church_hq_admin` (own church), `platform_admin` (any active resolved tenant).
- Unauthenticated HTML requests redirect to same-host **`/login?next=/branch-admin`** (host-only session after tenant login).
- Operational modules: registrations review, announcements, participation (events/ministries), aggregate attendance, manual giving summaries, resources, forms, and member requests enabled; individual check-in / online payments still “Not enabled”.

## Minimal church HQ shell + read-only branch selector

| Route | Behavior |
|-------|----------|
| `GET /hq` | Church identity, HQ name, active branch count, branch selector |
| `GET /hq/branches` | Full read-only active branch list |
| `GET /hq/branches/:branchKey` | Resolve by church UUID + key → authorize → redirect to `/branch-admin` |

- Inactive branches are **excluded** from the list; direct key access to inactive/unknown branches returns controlled **404**.
- Public URLs use `branch_key` only (never branch UUIDs).
- Access: `church_hq_admin` (own church), `platform_admin` (active resolved tenant). `branch_admin` receives **403** on HQ routes.
- Branch list is one read-only query against `blessboard.branches`. No writes, no legacy tables.
- Church settings: `GET/POST /hq/settings` (CSRF on POST) against `blessboard.church_settings`.

## Church and branch settings (normalized)

| Table | PK | Purpose |
|-------|----|---------|
| `blessboard.church_settings` | `church_id` | Public name, contact, website_status (`draft` / `published` / `suspended`) |
| `blessboard.branch_settings` | `branch_id` | Public name, contact, address, lat/lng |

- One row per church/branch. No JSON blobs for core settings.
- Rows are **not** created at startup; `ensureChurchSettingsInitialized` / `ensureBranchSettingsInitialized` are idempotent and called when opening settings.
- Updates are transactional upserts with `updated_at = now()`.
- Country codes `^[A-Z]{2}$`; phones stored as `+[digits]`; lat ∈ [-90,90], lng ∈ [-180,180].
- Routes: HQ `GET/POST /hq/settings`; branch `GET/POST /branch-admin/settings`.
- Authorization: `platform_admin` / `church_hq_admin` for church settings; branch settings for `branch_admin` (assigned branch), HQ, and platform. `branch_admin` cannot open church settings.
- **Audit:** `platform.audit_events` is append-only (no app UPDATE/DELETE). See `docs/database/AUDIT_RETENTION.md`. Settings / giving / registration / form / request writes record important outcomes with redacted metadata.
- **Entitlements:** `platform.plans` / `plan_features` / `organization_subscriptions` / `organization_entitlements`. Plan keys are immutable. Resolves via `entitlementService` (not route-local plan checks). Premium writes fail closed; public reads use the soft resolver. Plan changes never delete excess branches/users.
- **V4→V5 data migration:** Inventory/mapping in `docs/database/V4_TO_V5_DATA_MAPPING.md`. CLI tooling: `npm run migrate:v4-to-v5:{plan,dry-run,apply,verify}` under `src/migration/v4ToV5/` + `db/scripts/migrate-v4-to-v5.js`. Dry-run default; apply requires `--confirm`. Explicit `V4_SOURCE_DATABASE_URL` / `V5_TARGET_DATABASE_URL` / `DATABASE_IDENTITY_EXPECTED` only. Hosted cutover: `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md` (**do not execute** without signed go/no-go).

## Public website content model (schema + services; no UI yet)

| Table | Ownership | Purpose |
|-------|-----------|---------|
| `blessboard.public_pages` | `church_id` + optional `branch_id` | Page shells (`home`, `about`, …) with `draft` / `published` / `archived` |
| `blessboard.page_sections` | `page_id` | Ordered sections; `section_key` immutable |
| `blessboard.leaders` | church / optional branch | Leadership profiles |
| `blessboard.ministries` | church / optional branch | Ministry listings |
| `blessboard.events` | church / optional branch | Calendar events (`cancelled` allowed) |
| `blessboard.sermons` | church / optional branch | Sermon records |
| `blessboard.contact_channels` | church / optional branch | Contact methods |
| `blessboard.giving_methods` | church / optional branch | Giving instructions / links (public CMS) |
| `blessboard.giving_categories` | church | Catalog for manual giving summaries |
| `blessboard.giving_entries` | branch | Aggregated giving amounts (NUMERIC; no donor PII) |

- Content belongs to church or branch explicitly; branch must belong to church (trigger).
- Published rows require active church (and active branch when scoped).
- Archived rows cannot leave `archived` without a deliberate future policy change (trigger blocks silent reactivation).
- `page_key` / `section_key` are immutable. Plain text preferred; admin service rejects HTML-looking bodies until a sanitization policy exists.
- Limited JSONB `layout_metadata` on pages/sections only (object check).
- Read path: `publicContentReadService` (published only). Write path: `publicContentAdminService` (separate).
- `provisionEmptyPublicPages` creates empty draft page rows only — no demo sections or sample entities.
- No legacy `public.*` content tables.

### Public website rendering (authoritative tenant hosts)

| Route | Content |
|-------|---------|
| `/` | Home page + sections |
| `/about` | About page + sections |
| `/leadership` | Page + published leaders |
| `/ministries` | Page + published ministries |
| `/events` | Page + published events |
| `/sermons` | Page + published sermons |
| `/contact` | Page + published contact channels |
| `/giving` | Page + published giving methods |

- Requires `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` and a resolved active church (same gates as tenant landing).
- **Branch override:** published primary-branch scoped page/entities win over church-wide (`branch_id` null).
- Drafts never render. Wrong-church rows never render. Suspended `website_status` → 503.
- SEO: host-aware canonical + Open Graph; `noindex` for testing/demo or non-published website status; no tenant UUIDs in metadata.
- Security: EJS-escaped text; external URLs allowlisted (`http`/`https`/`mailto`/`tel` + same-site paths); external CSS only (CSP-friendly).
- Public chrome includes Sign in (`/login` transfer) and BlessBoard apex link — no HQ/admin links.
- V4 `views/church/public/*` and `server.legacy.js` remain the V4 path; V5 does not call `websiteContentService`.

### Public content administration (HQ + branch)

| Surface | Path prefix | Scope |
|---------|-------------|-------|
| HQ church-wide | `/hq/content` | `branch_id` null |
| HQ branch | `/hq/content/b/:branchKey` | Resolved branch in own church |
| Branch admin | `/branch-admin/content` | Hostname primary branch only |

- Roles: HQ routes `church_hq_admin` / `platform_admin`; branch-admin routes also allow `branch_admin` (assigned branch).
- CRUD for page shells (title/status), sections (`pageKey`/`sectionKey` URLs), and entities (ids in form bodies only).
- Status workflow: draft → publish (requires `confirm_publish`) → archive; no hard delete from UI.
- Optimistic concurrency: `expected_updated_at` must match (ms-truncated); conflicts return **409**.
- Preview: `/…/preview/:pageKey` shows draft+published for authorized users only (`noindex`).
- Media: binaries in object storage (local FS or Supabase Storage); metadata in `blessboard.media_assets`.
- Content fields accept HTTPS URLs or app paths `/_bb/media/:uuid` (public assets tenant-scoped).
- Private assets require content-admin authz; never served on `/_bb/media`.
- Upload only from existing content-admin forms (no bulk library yet). Service-role credentials stay server-side.

### Announcement administration (HQ + branch)

| Surface | Path prefix | Scope |
|---------|-------------|-------|
| HQ church-wide | `/hq/announcements` | `branch_id` null |
| HQ branch | `/hq/announcements/b/:branchKey` | Resolved branch in own church |
| Branch admin | `/branch-admin/announcements` | Hostname primary branch only |

- Roles: HQ routes `church_hq_admin` / `platform_admin`; branch-admin also allows `branch_admin`.
- Soft lifecycle: draft → publish (requires `confirm_publish`) → archive; no hard delete.
- Optimistic concurrency via `expected_updated_at` (409 on conflict).
- Preview for authorized admins; media attach by asset id (upload reuses content-admin media endpoint).
- Stitch `61` broadcast center remains deferred — HQ announcements reuse `35-*` patterns, not broadcast.

### Member identity + registration + portal shell

| Table | Role |
|-------|------|
| `blessboard.members` | Church-scoped person profile (optional `user_id` link) |
| `blessboard.member_branch_memberships` | Multi-branch membership; exactly one `is_primary` |
| `blessboard.member_registrations` | Intake + review workflow before membership |

- Privacy fields only: first/last/preferred name, email, phone (normalized + display).
- No national ID, health, financial, family, or password fields.
- Services: `submitMemberRegistration`, `reviewMemberRegistration`, `approveMemberRegistration`, `rejectMemberRegistration`, `linkMemberToUser`, `listMemberRegistrations`, `requireActiveMemberForTenant`, `getMemberPortalProfile` / `updateMemberPortalProfile`.
- Approval creates or links a member + membership transactionally; never auto-creates login users or plaintext passwords.
- Public routes: `GET/POST /register`, `GET /register/submitted` (CSRF + rate limit; host-scoped).
- Branch-admin: `/branch-admin/registrations` list/detail/approve/reject (pagination + search; internal rejection notes).
- HQ oversight (read/review): `/hq/registrations`, `/hq/members` church-wide with optional branch-key filter; privacy-limited fields; no church/branch UUIDs in HTML.
- Member portal: `GET /member`, `GET/POST /member/profile` — requires active user + active member + active membership on the host primary branch; admin roles alone never grant access. Profile edits are limited to preferred name, phone, and email display. Module cards are disabled placeholders (no fake counts). No member/church/branch UUIDs in URLs or HTML.
- Duplicate open registrations return a generic public message; logs omit PII.
- Tests: `npm run test:blessboard:members-schema`, `npm run test:blessboard:member-registration`, `npm run test:blessboard:member-portal`.

## Minimal platform-admin shell (apex-only)

| Route | Behavior |
|-------|----------|
| `GET /admin` | Platform-admin home + recent organization keys |
| `GET /admin/organizations` | Paginated read-only directory (default 25, max 100) |
| `GET /admin/organizations/:organizationKey` | Safe organization summary by key |

- **Apex hosts only.** Tenant hosts receive the controlled unavailable response.
- Requires an authenticated active user with `platform_admin`. `church_hq_admin` / `branch_admin` receive **403**. Unauthenticated HTML requests redirect to `/login`.
- Directory fields: organization key/name/environment/status, BlessBoard enrolment status, canonical hostname, church key/status, active branch count, deployment code.
- Optional filter: `organization_key` **prefix** only (unique index). No display-name scan / no new indexes.
- No org create/edit/delete, billing, domain editing, or impersonation.

## BlessBoard catalogue (churches and branches)

| Concept | Table | Meaning |
|---------|-------|---------|
| **Platform organization** | `platform.organizations` | Shared immutable tenant identity (`organization_key`, environment, status) |
| **BlessBoard church** | `blessboard.churches` | Product-specific church record; at most one per organization |
| **BlessBoard branch** | `blessboard.branches` | Campus/site under a church (`hq` or `branch`); not stored on platform |

- **`organization_id`** on `blessboard.churches` is the permanent UUID bridge to `platform.organizations.id` (unique + FK `ON DELETE RESTRICT`).
- One platform organization may have **at most one** BlessBoard church.
- Product enrolment remains in `platform.organization_products` (not duplicated on the church row). Database triggers require an **active** BlessBoard enrolment and matching `data_environment`.
- Branches belong only to a church (`church_id` FK `ON DELETE RESTRICT` — no silent cascade).
- At most one `branch_type = hq` and at most one `is_primary = true` per church.
- Provisioning is **explicit and transactional** (`npm run blessboard:church:provision`). No demo church is auto-created at migrate, bootstrap, or app startup.
- Platform hostname + catalogue resolution feed the tenant-routing flag; with `off`/`shadow` they remain non-authoritative for browser content.
- Member / giving / CMS portals remain unavailable. Authoritative mode enables the read-only tenant landing; HQ / branch-admin shells require tenant-host login + authorization. Apex platform-admin is separate.
- Legacy `public.tenants` / `public.session` remain absent. V4 remains on the legacy database unchanged.

## Separate concepts (do not collapse)

| Concept | Table | Meaning |
|---------|-------|---------|
| **Deployment** | `platform.deployments` | Running app release + cookie/job/domain ownership (e.g. V4 vs V5) |
| **Product** | `platform.products` | Sellable/shared product identity (`blessboard`, `getpro`, `ngo`) |
| **Organization** | `platform.organizations` | Thin shared tenant identity only |
| **Domain** | `platform.domains` | Hostname routing; may link org and/or deployment |

Product-specific organization details (church settings, CRM fields, NGO programme data, etc.) remain inside the corresponding product schema — not on `platform.organizations`.

**Branches are intentionally not shared** (`platform.branches` does not exist). Branch/site meaning differs by product (church campus vs GetPro location vs NGO site), so each product owns its own branch model when needed.

## Primary keys

- New platform tables use **UUID primary keys** for surrogate identity (`products`, `organizations`, `organization_products`, `domains`).
- Natural/business keys remain text when they are the stable external identifier (`deployment_code`, `product_key`, `organization_key`).
- `platform.domains.deployment_id` is TEXT referencing `platform.deployments.deployment_code` (deployments use a text PK, not UUID).
- Do not introduce serial/bigserial for new platform foundation tables.

## Migrations as sole schema authority

- On-disk SQL under `db/migrations/<module>/` is the **only** authority for schema shape.
- `platform.schema_migrations` records applied module/version/checksum.
- **No runtime table creation by web workers.** Application startup must not invent or apply DDL.
- Legacy `db/postgres/` and `ensure*Schema.js` paths remain for the old database; they are not the authority for this new foundation.
- Do not modify existing legacy migrations as part of this foundation.

## Migration runner rules

- Connection string: **`DATABASE_URL` only**.
- **No `GETPRO_DATABASE_URL` fallback** in migrate/status/identity scripts.
- Migrations never run during normal server startup.
- Apply inside transactions where supported.
- Modules execute in a fixed order: `platform` → `blessboard` → `getpro` → `ngo`.
- Re-runs are idempotent for already-applied matching checksums.
- Checksum mismatch against a recorded row **fails hard** (drift rejection).
- Credentials and full connection strings are never printed.
- Identity is **not** silently initialized by migrate or server boot.

## Database identity

- `platform.database_identity` is a **singleton**.
- **`identity_key`** (env: `DATABASE_IDENTITY_EXPECTED`, e.g. `blessboard-platform-v5`) names the **physical database purpose**. It is **not** `PLATFORM_DEPLOYMENT_CODE`.
- **`environment_code`** remains one of: `preproduction`, `shared`, `production`, `testing`.
- Hosted first-run: `npm run db:bootstrap:foundation` (manual only) migrates **all approved modules** (platform + approved BlessBoard catalogue migrations + empty getpro/ngo schemas), seeds, initializes identity if missing, then verifies against an approved-table allowlist.
- Standalone init: `npm run db:identity:init -- --env <code> --confirm` with `DATABASE_IDENTITY_EXPECTED` set.
- Host is stored only as a **sanitized fingerprint**, never a password or full URL.
- Rerun with the same identity is idempotent; a different expected identity fails closed.
- See `docs/database/HOSTED_SUPABASE_RUNBOOK.md`.

### Foundation verify allowlist

`npm run db:verify:foundation` expects:

- Platform tables including `deployment_sessions`.
- BlessBoard: `churches`, `branches`, `church_settings`, `branch_settings`, `users`, `user_roles`, public content tables (`public_pages`, `page_sections`, `leaders`, `ministries`, `events`, `sermons`, `contact_channels`, `giving_methods`), `media_assets`, member identity tables (`members`, `member_branch_memberships`, `member_registrations`), announcements, participation, attendance, and manual giving (`giving_categories`, `giving_entries`).
- `getpro` and `ngo` base-table empty.
- `public.tenants` / `public.session` absent.

## Deployments, sessions, and jobs

- V4 and V5 coexist as separate rows in `platform.deployments`.
- Separate cookies, secrets, and session tables per deployment (session wiring is a later phase).
- Seeded deployments:
  - `blessboard-com-v4` — `jobs_enabled = true` (V4 is the only BlessBoard background-job owner initially).
  - `blessboard-org-v5` — `jobs_enabled = false` (V5 jobs disabled).
- Unique `canonical_domain` and unique `session_cookie_name` enforce isolation.

## Tenant catalogue

- Seeded products only: `blessboard`, `getpro`, `ngo` (no church/branch/customer/demo org seeds).
- `product_key` / `organization_key` are unique and immutable after insert.
- `organization_products.product_tenant_key` is unique **within a product**; the same key may appear under different products.
- Domain hostnames are stored normalized (lowercase, trimmed, no trailing dot) and globally unique; protocol, path, port, and whitespace are rejected.

## Hostname resolution (read-only application layer)

Application code under `src/platform/` can resolve a hostname against `platform.domains` without writing data.

| Piece | Role |
|-------|------|
| `src/platform/hostname.js` | Shared normalizer (matches DB hostname rules; never extracts host from a URL) |
| `src/platform/repositories/domainRepository.js` | Single parameterized joined SELECT; returns a row or `null` |
| `src/platform/services/resolveHostname.js` | Typed resolution result; status policy only — no HTTP/redirect decisions |
| `src/platform/config/platformHostContextMode.js` | `PLATFORM_HOST_CONTEXT_MODE` (`off` \| `diagnostic`, default `off`) |
| `src/platform/config/platformDeploymentCode.js` | Explicit `PLATFORM_DEPLOYMENT_CODE` (running deployment identity) |
| `src/platform/http/loadPlatformHostContext.js` | Opt-in Express diagnostic loader (fail-open; server-side only) |
| `src/blessboard/http/loadBlessBoardCatalogueContext.js` | After platform host context: org → church → HQ/primary (BlessBoard tenants only) |
| `src/platform/http/compareLegacyHostContext.js` | Observational platform vs legacy comparison (after legacy + catalogue attach) |

### Database identity vs deployment identity

| Concept | Source | Meaning |
|---------|--------|---------|
| **Database identity** | `platform.database_identity.identity_key` / `DATABASE_IDENTITY_EXPECTED` | Which physical DB purpose this database is marked as |
| **Deployment identity** | `PLATFORM_DEPLOYMENT_CODE` | Which application deployment this process is (e.g. `blessboard-com-v4`, `blessboard-org-v5`) |

They are **not interchangeable**. Deployment code is never inferred from hostname, `NODE_ENV`, `BASE_DOMAIN`, database URL, Git branch, cookie name, or database identity markers.

### Diagnostic HTTP host context (`PLATFORM_HOST_CONTEXT_MODE`)

| Value | Behavior |
|-------|----------|
| `off` (default) | No platform hostname lookup; no comparison; `PLATFORM_DEPLOYMENT_CODE` optional |
| `diagnostic` | Resolve via `resolveHostname`; optional `expectedDeploymentCode` from `PLATFORM_DEPLOYMENT_CODE`; compare after legacy attach |
| any other value | Treated as `off` (warn once) |

When diagnostic and `PLATFORM_DEPLOYMENT_CODE` is valid, it is passed as `expectedDeploymentCode` (enables `deployment_mismatch`). When absent/invalid: fail-open resolve without mismatch evaluation; one startup warning; `deploymentComparisonAvailable: false`.

Rules:

- **Legacy routing remains authoritative.** Loaders run in parallel and do not change routing, redirects, auth, sessions, cookies, or jobs.
- **Fail-open:** unexpected DB/lookup failures become middleware `resultType: lookup_error` (not a resolver domain type) and always call `next()`.
- **Server-side only:** `req.platformHostContext` / `req.platformHostComparison` are not exposed to templates, API JSON, or browsers.
- **Logging:** routine request diagnostics use `event: platform_host_comparison` (includes catalogue IDs/`comparisonBasis` when present); loaders log `platform_host_context` / `blessboard_catalogue_context` only for lookup errors. No persistent metrics/telemetry.
- Hosted Supabase is still not connected; the loader uses the app’s existing `getPgPool()`.

### Platform vs legacy comparison categories

| Category | Meaning |
|----------|---------|
| `match` | Same stable tenant key and compatible product hint |
| `legacy_only` | Legacy has a tenant; platform has no active tenant identity |
| `platform_only` | Platform resolves a tenant; legacy has none |
| `identity_mismatch` | Both have tenant keys, but they differ |
| `product_mismatch` | Both have product identities, but they differ |
| `not_comparable` | Apex, lookup_error, inactive/unresolved without safe shared IDs, or missing keys |

### Platform hostname vs BlessBoard catalogue (separate layers)

| Layer | Input | Output on `req` | Queries |
|-------|-------|-----------------|---------|
| Platform hostname | Host header | `platformHostContext` | 1 joined domain resolve |
| BlessBoard catalogue | Platform org UUID (when applicable) | `blessBoardCatalogueContext` | 0 or 1 joined church/branch read |

BlessBoard lookup runs only when platform context is enabled, `resultType=resolved_tenant`, `product.key=blessboard`, and organization UUID is present. Apex, unknown domains, inactive platform results, getpro/ngo, and missing org IDs attach a typed `not_applicable` / `platform_*` result and **perform no catalogue query**.

HQ and primary branches are resolved separately (they may be the same row). Missing/inactive church or branch states are typed (`church_missing`, `hq_branch_missing`, …) — never collapsed to bare `null` without a result type.

Comparison prefers UUIDs when both sides have them (`comparisonBasis`: `organization_uuid` → `church_uuid` → `product_and_key` → `none`). Display names are never compared. Legacy request context often still lacks platform UUIDs, so key fallback remains temporary and diagnostic.

Catalogue context remains **non-authoritative**: no redirects, no tenant content, no session/auth decisions.

### Platform tenant provisioning (administrative)

Explicit CLI / service operation — **never** run during application startup or migrations.

| Piece | Role |
|-------|------|
| `src/platform/services/provisionPlatformTenant.js` | Transactional find-or-create of org + enrolment + domain |
| `src/platform/repositories/platformProvisioningRepository.js` | Parameterized SQL helpers |
| `npm run platform:tenant:provision` | DATABASE_URL-only CLI (requires `platform.database_identity`) |

Creates **platform catalogue records only** (organization, organization_products, domains). Does **not** create BlessBoard church/branch/member records, GetPro/NGO product tables, sessions, auth users, or `public` application tables.

- Single transaction; rollback on any failure.
- Idempotent: identical input → `already_provisioned` (no silent updates).
- Ownership conflicts never overwritten (`organization_conflict`, `enrolment_conflict`, `hostname_conflict`, …).
- Does not infer product/deployment/environment from hostname.

### BlessBoard church provisioning (administrative)

Explicit CLI / service operation after a platform tenant exists with active BlessBoard enrolment — **never** at startup or in migrations.

| Piece | Role |
|-------|------|
| `src/blessboard/services/provisionBlessBoardChurch.js` | Transactional find-or-create of church + HQ branch |
| `src/blessboard/repositories/blessBoardCatalogueRepository.js` | Parameterized SQL helpers |
| `src/blessboard/services/getBlessBoardCatalogueContext.js` | Read-only org → church → HQ/primary branch lookup (not wired to Express yet) |
| `npm run blessboard:church:provision` | DATABASE_URL-only CLI (requires `DATABASE_IDENTITY_EXPECTED` + identity row) |

- Single transaction; rollback on any failure.
- Idempotent: identical input → `already_provisioned` (no silent updates).
- Conflicts: `church_conflict`, `branch_conflict`, `environment_mismatch`, enrolment failures, etc.
- Does not infer organization or environment from hostname.
- Does not create demo churches automatically.

### Domain-type meanings

| `domain_type` | Meaning |
|---------------|---------|
| `apex` | Product-level root hostname; organization is normally null; no enrolment required |
| `canonical` | Primary platform-issued tenant hostname; requires organization + matching enrolment |
| `custom` | Customer-owned tenant hostname; requires organization + matching enrolment |
| `alias` | Secondary hostname for a tenant; resolves tenant context; **no redirects implemented yet** |

### Resolution rules

- Apex may resolve without an organization or `organization_products` row.
- Canonical, custom, and alias require an organization and a matching `organization_products` row for the same product.
- No legacy `public` fallback. No automatic tenant creation. No product-schema tables involved.

### `deployment_mismatch`

Means: **the hostname is assigned to a platform deployment that differs from the expected deployment identity supplied by the calling application.**

`resolveHostname(db, hostname, { expectedDeploymentCode })` evaluates this only when `expectedDeploymentCode` is supplied (from `PLATFORM_DEPLOYMENT_CODE` in diagnostic mode). Never inferred from hostname text; never read from env inside `resolveHostname`.

## Out of scope (current)

- `platform.branches`
- GetPro / NGO product tables
- BlessBoard member portal modules beyond announcements / events / ministries / resources / forms / requests (giving portal views)
- Password reset, email verification, OAuth, MFA
- Compatibility views over legacy `public`
- Using host context for authoritative routing, redirects, or tenant content
- Domain redirects (alias → canonical)
- Application pool cutover for V4 away from legacy `public` schemas
- Hosted Supabase connection or deploy from CI/agents
- Persistent metric tables or hosted telemetry
- Automatic demo tenant/church/admin creation at startup
- Silent reassignment of hostnames, product enrolments, or church ownership
- Making platform hostname resolution or BlessBoard catalogue context authoritative
- `public.session` / `connect-pg-simple` on V5
- Automatic login-account creation from member registration approval
- Collecting national ID, health, financial, or family data on members
- Registration exports / bulk download
- Ministry role graphs beyond branch membership
- Member directory / HQ cross-branch registration inbox → **HQ read/review:** `/hq/members`, `/hq/registrations` (approve/reject remains branch-admin)
