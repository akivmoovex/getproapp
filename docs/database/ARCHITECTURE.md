# BlessBoard database architecture

Clean multi-schema foundation for a shared PostgreSQL database used initially by BlessBoard V4 and V5. GetPro and NGO schemas are reserved empty shells for later products. This document is the source of truth for ownership and runtime rules.

## Physical topology

- One physical PostgreSQL database (new empty Supabase project when hosted).
- Shared by BlessBoard V4 (`blessboard.com`) and V5 (`blessboard.org`) initially.
- Implement BlessBoard only in this phase.
- Do not copy the legacy `public` schema or move legacy tables into the new schemas.

## Target schemas

| Schema | Ownership | Status |
|--------|-----------|--------|
| `platform` | Shared cross-product registry (migrations, identity, deployments, tenant catalogue) | Foundation + tenant catalogue |
| `blessboard` | BlessBoard product data | Schema created; product tables deferred |
| `getpro` | GetPro product data | Empty schema reserved |
| `ngo` | NGO product data | Empty schema reserved |
| `public` | No new application tables | Must remain free of new app DDL |
| `auth`, `storage`, `realtime`, `extensions` | Supabase-managed | Untouched — never modify |

## Schema ownership rules

1. **Application tables belong only in product or platform schemas.** Never create new application tables in `public`.
2. **Schema-qualified SQL is mandatory.** All new queries and migrations must use explicit qualifiers (`platform.deployments`, `blessboard.…`). Unqualified names are not allowed for application objects.
3. **Platform owns cross-cutting registry tables** (`schema_migrations`, `database_identity`, `deployments`, `products`, `organizations`, `organization_products`, `domains`). Product domains do not own these.
4. **BlessBoard owns BlessBoard product tables** under `blessboard` only (created in later phases).
5. **GetPro and NGO** may only receive empty schema placeholders now. No product tables until those phases begin.
6. **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `extensions`) must not be altered by application migrations or scripts.

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
- Initialization requires an explicit CLI with confirmation (`npm run db:identity:init -- --confirm …`).
- Allowed `environment_code` values: `preproduction`, `shared`, `production`, `testing`.
- Host is stored only as a **sanitized fingerprint**, never a password or full URL.

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
| `src/platform/http/compareLegacyHostContext.js` | Observational platform vs legacy comparison (after legacy attach) |

### Database identity vs deployment identity

| Concept | Source | Meaning |
|---------|--------|---------|
| **Database identity** | `platform.database_identity` / `church:db-identity:init` | Which physical DB environment this database is marked as |
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
- **Logging:** routine request diagnostics use `event: platform_host_comparison`; loader logs `platform_host_context` only for `lookup_error`. No persistent metrics/telemetry.
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

Stable legacy keys used today: church `orgSlug` / `organization.slug`; GetPro `tenant.slug`. Shared platform organization UUIDs are not yet present on legacy request context. Slug/key comparison remains **diagnostic and temporary**; the immutable platform organization UUID is the future authoritative shared identity once legacy context carries it.

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
- BlessBoard / GetPro / NGO product tables
- Compatibility views over legacy `public`
- Using host context for routing, redirects, auth, sessions, cookies, or jobs
- Domain redirects (alias → canonical)
- Application pool cutover away from legacy `public` schemas
- Church/tenant data seeds in production migrations
- Hosted Supabase connection or deploy
- Persistent metric tables or hosted telemetry
- Automatic demo tenant creation at startup
- Silent reassignment of hostnames or product enrolments
