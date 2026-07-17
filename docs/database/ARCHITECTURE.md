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
| Tenant portals / member / HQ / branch | Controlled 503 | Full product |
| Platform host diagnostics | Optional (`PLATFORM_HOST_CONTEXT_MODE=diagnostic`); non-authoritative | Optional; non-authoritative |

Foundation mode serves apex auth with deployment-scoped sessions. Platform hostname resolution and BlessBoard catalogue remain diagnostic only — not authoritative for tenant routing.

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
3. **Platform owns cross-cutting registry tables** (`schema_migrations`, `database_identity`, `deployments`, `products`, `organizations`, `organization_products`, `domains`). Product domains do not own these.
4. **BlessBoard owns BlessBoard product tables** under `blessboard` only. Current: `churches`, `branches`, `users`, `user_roles`.
5. **GetPro and NGO** may only receive empty schema placeholders now. No product tables until those phases begin.
6. **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `extensions`) must not be altered by application migrations or scripts.
7. **V5 sessions** live in `platform.deployment_sessions` (token hash only, deployment-scoped). Never `public.session` / `connect-pg-simple` on V5.

## V5 apex authentication (deployment-scoped)

| Piece | Role |
|-------|------|
| `platform.deployment_sessions` | Session rows keyed by SHA-256 token hash + `deployment_code` |
| `blessboard.users` | Minimal login identity (bcrypt password hash) |
| `blessboard.user_roles` | `platform_admin` / `church_hq_admin` / `branch_admin` scopes |
| Cookie | `SESSION_COOKIE_NAME` (default `blessboard_org_v5_sid`); HttpOnly; Secure in production; SameSite=Lax; 12h |
| CSRF | Signed double-submit cookie (`v5c1…`) using `SESSION_SECRET` — independent of express-session |
| Routes | Apex only: `GET/POST /login`, `POST /logout`, `GET /account` |

- Login is **apex-only** (`blessboard.org` / `www.blessboard.org`). Tenant host `/login` stays controlled unavailable.
- Sessions created for `blessboard-org-v5` do not authenticate on `blessboard-com-v4`.
- No password reset, email verification, OAuth, MFA, or tenant portal access in this phase.
- Provision users/roles explicitly via CLI — never at startup.

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
- Platform hostname routing remains **diagnostic / non-authoritative**. Apex auth is available; tenant portals remain unavailable on V5 foundation mode.
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
- BlessBoard: `churches`, `branches`, `users`, `user_roles`.
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
- BlessBoard members, ministry roles, events, public content, portals
- Password reset, email verification, OAuth, MFA
- Compatibility views over legacy `public`
- Using host context for authoritative routing, redirects, or tenant content
- Domain redirects (alias → canonical)
- Application pool cutover for V4 away from legacy `public` schemas
- Tenant-host login and portal dashboards
- Hosted Supabase connection or deploy from CI/agents
- Persistent metric tables or hosted telemetry
- Automatic demo tenant/church/admin creation at startup
- Silent reassignment of hostnames, product enrolments, or church ownership
- Making platform hostname resolution or BlessBoard catalogue context authoritative
- `public.session` / `connect-pg-simple` on V5
