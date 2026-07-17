# Hosted Supabase foundation runbook (BlessBoard V5)

Initialize the **new** hosted Supabase database with the platform foundation and approved BlessBoard catalogue tables.
This is a **manual operator** flow. It never runs during application startup.

## What this does

Creates:

| Kind | Objects |
|------|---------|
| Schemas | `platform`, `blessboard`, `getpro`, `ngo` |
| Platform tables | `schema_migrations`, `database_identity`, `deployments`, `products`, `organizations`, `organization_products`, `domains`, `deployment_sessions` |
| BlessBoard catalogue | `blessboard.churches`, `blessboard.branches` |
| BlessBoard auth | `blessboard.users`, `blessboard.user_roles` |
| Platform sessions | `platform.deployment_sessions` |
| Deployment seeds | `blessboard-com-v4`, `blessboard-org-v5` |
| Product seeds | `blessboard`, `getpro`, `ngo` |

Does **not** create:

- `public.tenants`, `public.session`, or any legacy `public` application tables
- GetPro / NGO product application tables
- BlessBoard members, ministries, events, content, or portal tables
- Demo organizations, churches, or admin users (provisioning is explicit and separate)
- Changes to Supabase-managed schemas (`auth`, `storage`, `realtime`, `extensions`, …)

## Command boundary (Approach B)

| Command | Meaning |
|---------|---------|
| `npm run db:migrate` | Applies **all** approved on-disk migrations (`platform` → `blessboard` → `getpro` → `ngo`) + seeds |
| `npm run db:bootstrap:foundation` | Migrate + identity init (if needed) + `db:verify:foundation` |
| `npm run db:verify:foundation` | Read-only check using an **approved-table allowlist** (`blessboard.churches`/`branches`/`users`/`user_roles`, `platform.deployment_sessions`; getpro/ngo empty) |

`db:bootstrap:foundation` is still the hosted first-run helper; it is no longer “platform tables only” once BlessBoard catalogue migrations exist. Prefer `db:migrate` when the database already has identity and you only need new migrations.

## Concepts (do not mix)

| Variable / concept | Meaning |
|--------------------|---------|
| `DATABASE_URL` | Connection string for the **new** Supabase Postgres database only |
| `DATABASE_IDENTITY_EXPECTED` | Purpose key for **this physical database** (e.g. `blessboard-platform-v5`) |
| `DATABASE_IDENTITY_ENV` | Environment marker on the identity row (`testing` / `production` / …). Default for bootstrap: `testing` |
| `PLATFORM_DEPLOYMENT_CODE` | Running app deployment (e.g. `blessboard-org-v5`) — **not** the database identity |

## Prerequisites (Mac)

1. Node.js ≥ 20 and repo dependencies installed (`npm install`).
2. Supabase project created; copy the **Postgres connection string** (prefer **direct** or **session-mode** pooler for DDL; avoid transaction-mode pooler for migrations if you see lock/transaction errors).
3. Confirm you are **not** pointing at the legacy V4 database.

## Exact commands

Use placeholders only. Never commit real URLs or passwords.

```bash
cd /path/to/getpro

export DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/postgres'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
# optional; defaults to testing
export DATABASE_IDENTITY_ENV='testing'

# Optional SSL override (default for *.supabase.* is TLS with no-verify, matching app pool behavior).
# export FOUNDATION_PG_SSL='strict'   # or no-verify | off

npm run db:migrate
npm run db:status
npm run db:identity:check
npm run db:verify:foundation
```

If identity is not initialized yet, either run bootstrap once:

```bash
npm run db:bootstrap:foundation
```

or stepwise:

```bash
npm run db:migrate
npm run db:identity:init -- --env testing --confirm
npm run db:status
npm run db:identity:check
npm run db:verify:foundation
```

### Provision platform tenant, then BlessBoard church

No demo org/church is created automatically.

```bash
npm run platform:tenant:provision -- \
  --organization-key example-church \
  --display-name "Example Church" \
  --environment testing \
  --product blessboard \
  --tenant-key example-church \
  --hostname example.blessboard.org \
  --domain-type canonical \
  --deployment blessboard-org-v5

npm run blessboard:church:provision -- \
  --organization-key example-church \
  --church-key example-church \
  --display-name "Example Church" \
  --environment testing \
  --hq-branch-key hq \
  --hq-branch-name "Headquarters" \
  --timezone Africa/Lusaka \
  --country-code ZM
```

Exit zero for `provisioned` and `already_provisioned`. Conflicts exit non-zero.

### Create first V5 admin user (after church exists)

```bash
printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email admin@example.org \
  --display-name 'Administrator' \
  --password-stdin

npm run blessboard:user:role:assign -- \
  --email admin@example.org \
  --organization-key example-church \
  --role church_hq_admin \
  --church-key example-church
```

Hostinger extras for apex auth:

```bash
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
SESSION_SECRET=<long random secret ≥ 32 chars>
SESSION_COOKIE_NAME=blessboard_org_v5_sid
```

Then open `https://blessboard.org/login` (apex only). Tenant host `/login` remains unavailable.

### Verify one provisioned church (SQL + curls)

```sql
select
  o.organization_key,
  c.id as church_id,
  c.church_key,
  b.id as branch_id,
  b.branch_key,
  b.branch_type,
  b.is_primary
from platform.organizations o
join blessboard.churches c
  on c.organization_id = o.id
join blessboard.branches b
  on b.church_id = c.id
where o.organization_key = 'example-church';
```

With Hostinger V5 foundation running and `PLATFORM_HOST_CONTEXT_MODE=diagnostic` (routing remains non-authoritative):

```bash
# Health
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

# Apex — no church lookup required; foundation homepage
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: blessboard.org' https://blessboard.org/
# expect 200 foundation HTML (not tenant content)

# Known BlessBoard tenant hostname — diagnostics may load; content still foundation/unavailable
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: example.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML (not church portal)

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: example.blessboard.org' https://blessboard.org/login
# expect 503 controlled unavailable

# Unknown hostname — still controlled foundation responses
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/healthz
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/login
# expect 503
```

Server logs may show `platform_host_comparison` (and `blessboard_catalogue_context` only on catalogue lookup errors). Never expect redirects or tenant pages from catalogue data in this phase.

## Safe SQL verification (Supabase SQL editor)

```sql
select to_regnamespace('platform');
select to_regnamespace('blessboard');
select to_regnamespace('getpro');
select to_regnamespace('ngo');

select table_schema, table_name
from information_schema.tables
where table_schema in ('platform', 'blessboard', 'getpro', 'ngo', 'public')
order by table_schema, table_name;

select
  to_regclass('public.tenants') as public_tenants,
  to_regclass('public.session') as public_session;

select identity_key, environment_code, database_name, host_fingerprint
from platform.database_identity
where id = 1;

select deployment_code, jobs_enabled from platform.deployments order by 1;
select product_key from platform.products order by 1;
```

Expected:

- Four application schemas exist (`platform`, `blessboard`, `getpro`, `ngo`).
- Platform tables listed above exist.
- BlessBoard has **only** `churches` and `branches` (plus no extra app tables).
- `getpro` / `ngo` have **no** base tables.
- `public_tenants` and `public_session` are **null**.
- Identity `identity_key` matches `DATABASE_IDENTITY_EXPECTED`.

## Stop conditions

Stop and do **not** continue if:

- Database identity differs from `DATABASE_IDENTITY_EXPECTED`
- Migration checksum drift is reported
- Unexpected `public` application tables appear (`tenants`, `session`, …)
- Product schemas contain unexpected tables (beyond the BlessBoard allowlist)
- The host fingerprint does not match the intended Supabase project
- An existing identity belongs to another purpose
- Any command prints a full `DATABASE_URL`, password, or credentials
- Migrations attempt to alter `auth`, `storage`, `extensions`, or other managed schemas

## Rerun behavior

- Same `DATABASE_URL` + same `DATABASE_IDENTITY_EXPECTED` → **idempotent** (safe to re-run).
- Same database + **different** `DATABASE_IDENTITY_EXPECTED` → **fails** (will not overwrite).
- Different environment code vs existing row → **fails**.
- Identical church provision input → `already_provisioned` (no silent updates).

## Local testing only

Automated tests use an ephemeral local database and may set:

```bash
FOUNDATION_ALLOW_LOCALHOST=1
```

Do **not** set that for hosted bootstrap.

## After bootstrap: Hostinger V5 foundation env

Minimum for V5 foundation HTTP (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + `DEPLOYMENT_ENV=testing`):

```bash
NODE_ENV=production
DEPLOYMENT_ENV=testing
DATABASE_URL=<new initialized Supabase database>
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
BLESSBOARD_JOBS_ENABLED=0
SESSION_SECRET=<long random secret>
BASE_DOMAIN=blessboard.org
```

Recommended extras:

```bash
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
PLATFORM_HOST_CONTEXT_MODE=diagnostic
PUBLIC_SCHEME=https
```

**Required for production boot (even in foundation mode):** `SESSION_SECRET` and `BASE_DOMAIN` — `assertProductionRequiredEnvOrExit` runs before the V5/legacy branch.

**Leave unset:** `GETPRO_DATABASE_URL` (must not point V5 at the legacy DB). Do not omit `PLATFORM_DEPLOYMENT_CODE` or set `DEPLOYMENT_ENV` to anything other than `testing` — that loads `server.legacy.js` and will crash without `public.tenants`.

`FOUNDATION_PG_SSL` is **not** required for normal Supabase use (defaults to TLS). `DATABASE_IDENTITY_EXPECTED` is required for Mac bootstrap/verify/provision CLIs; unused by the HTTP foundation process but safe to set on Hostinger for operator consistency.

## Why the hosted DB was empty before

V5 foundation HTTP mode can start without platform schemas. Migrations are **never** applied at app startup. Until `db:bootstrap:foundation` (or `db:migrate`) succeeds against `DATABASE_URL`, Supabase only shows its default managed schemas.
