# Supabase / PostgreSQL environment variables

The app is **PostgreSQL-only** at runtime (`server.js` exits if no connection string). Application data and **sessions** use the same pool (`connect-pg-simple`, table `public.session`). There is **no** SQLite session store or hybrid mode. See **`docs/SQLITE_RUNTIME_CUTOVER.md`**.

## Connection string (required)

| Variable | Description |
|----------|-------------|
| **`DATABASE_URL`** | **Preferred.** Postgres URI. In Supabase: **Project Settings → Database → Connection string → URI** (direct port **5432** or pooler **6543**). The dashboard string often includes `?sslmode=require`. |
| **`GETPRO_DATABASE_URL`** | Fallback if `DATABASE_URL` is unset. Same format. |

If both are set, **`DATABASE_URL` wins**. Do **not** commit these values; use `.env` locally (see `.env.example`) and the host panel in production.

## SSL / TLS (`GETPRO_PG_SSL`)

Supabase uses TLS. Node’s `pg` driver plus **`sslmode=require`** in the URI can verify the server certificate strictly; on some hosts (e.g. **Hostinger**) you may see **`self-signed certificate in certificate chain`**. Control behavior with **`GETPRO_PG_SSL`** (same pool for app data, sessions, and admin bootstrap):

| Value | Pool behavior |
|-------|----------------|
| **`strict`** | `ssl: { rejectUnauthorized: true }` — full verification. |
| **`no-verify`** | `ssl: { rejectUnauthorized: false }` — encrypted, but hostname/chain not verified (typical fix for the error above). |
| **`off`** | No TLS (`ssl: false`) — local Postgres without SSL only. |

When **`GETPRO_PG_SSL` is unset**:

- **Supabase-style hostnames** (e.g. `*.supabase.co`, pooler hostnames): default to **`no-verify`** (same as explicit `GETPRO_PG_SSL=no-verify`).
- **Localhost**: no pool-level SSL; driver follows the URI.
- **Other remote hosts**: no pool-level SSL; URI / driver defaults apply.

When **`GETPRO_PG_SSL` is set to `strict`, `no-verify`, or `off`**, `sslmode` / `ssl` **query parameters are removed** from the connection string before creating the pool so the URI does not imply verify-full while the pool sets a different `ssl` object.

Legacy aliases: `require` / `true` / `1` → **`strict`**; `0` / `false` / `disable` → **`off`**.

## Pool tuning (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `GETPRO_PG_POOL_MAX` | `10` | Max clients in the pool (`pg` `Pool`). |
| `GETPRO_PG_IDLE_MS` | `30000` | `idleTimeoutMillis`. |
| `GETPRO_PG_CONNECT_TIMEOUT_MS` | `10000` | `connectionTimeoutMillis`. |

## Connectivity and schema checks

| Mechanism | How |
|-----------|-----|
| **CLI** | `npm run test:pg` — `SELECT current_database()`; exits `0` with a skip message if no URL (CI-safe). |
| **Schema / tables** | `npm run check:pg` — connects and verifies core tables exist; hints to run `db/postgres/000_full_schema.sql` if not. |
| **Repos (optional)** | `npm run test:pg:repos` — smoke-test repositories after schema apply. |
| **HTTP (opt-in)** | Set **`GETPRO_PG_HEALTH_ROUTE=1`**, then **`GET /api/debug/pg-ping`** returns JSON with `ok`, `database`, `schema` or an error. **Disabled by default** so production does not expose this accidentally. |

## Callback interests

When **`public.callback_interests`** exists, **`POST /api/callback-interest`** and admin **Leads** read/write PostgreSQL. No extra env flag.

## Code location

- Pool: `src/db/pg/pool.js` (`getPgPool`, `isPgConfigured`, `closePgPool`, `logPgStartupDiagnostics`)
- Re-export: `src/db/pg/index.js`
- Callbacks: `src/db/pg/callbacksRepo.js`
