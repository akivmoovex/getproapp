# PostgreSQL (`pg`) — optional

Lazy **`pg.Pool`** for Supabase or any Postgres. **SQLite** remains the application database until migration stages opt in.

## Layout

| File | Purpose |
|------|---------|
| `pool.js` | `getPgPool()`, `isPgConfigured()`, `closePgPool()` — env: `DATABASE_URL` or `GETPRO_DATABASE_URL` |
| `index.js` | Re-exports pool + repository modules |
| `tenantsRepo.js` | `public.tenants` read helpers |
| `categoriesRepo.js` | `public.categories` |
| `companiesRepo.js` | `public.companies` |
| `reviewsRepo.js` | `public.reviews` |
| `leadsRepo.js` | `public.leads`, `public.lead_comments` (admin updates) |
| `tenantCitiesRepo.js` | `public.tenant_cities` |
| `callbacksRepo.js` | `public.callback_interests` (primary when `DATABASE_URL` is set) |
| `professionalSignupsRepo.js` | `public.professional_signups` |
| `crmTasksRepo.js` / `crmAuditRepo.js` | `public.crm_tasks`, comments, audit logs |
| `callbackInterestMirror.js` | Deprecated alias to `callbacksRepo` |

Repositories are **SQL-only** (no base classes). Each async function takes **`pool`** as the first argument.

## Usage (from a route or script)

From a file under `src/routes/`:

```js
const { getPgPool, tenantsRepo } = require("../db/pg");

const pool = getPgPool();
if (pool) {
  const tenant = await tenantsRepo.getById(pool, 4);
}
```

## Environment variables

Same as **`docs/SUPABASE_ENV.md`** / `.env.example`: **`DATABASE_URL`** or **`GETPRO_DATABASE_URL`**, optional pool tuning (`GETPRO_PG_*`).

## Connectivity

- **`npm run test:pg`** — `SELECT current_database()` (skips if URL unset).

## Schema

Apply SQL under **`db/postgres/`** (see `db/postgres/README.md`). Table names use the **`public`** schema in repository SQL.
