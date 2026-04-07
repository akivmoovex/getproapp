# Supabase / PostgreSQL environment variables

The app uses **SQLite** for the main app database (`src/db`) and **PostgreSQL** for migrated features when a connection string is set. **Sessions** use PostgreSQL by default when `DATABASE_URL` is set (`connect-pg-simple`); otherwise they use a local SQLite file. See **`docs/SQLITE_RUNTIME_CUTOVER.md`**. Secrets are never hardcoded.

## Connection string (required for any PG feature)

| Variable | Description |
|----------|-------------|
| **`DATABASE_URL`** | Primary. Postgres connection URI. In Supabase: **Project Settings → Database → Connection string → URI** (direct `5432` or pooler `6543`). Include password; use `?sslmode=require` if the host requires SSL. |
| **`GETPRO_DATABASE_URL`** | Alternative name; used if `DATABASE_URL` is unset. Same format. |

Do **not** commit these values. Set them in `.env` locally and in your host’s environment panel in production.

## Sessions (when Postgres is configured)

| Variable | Description |
|----------|-------------|
| **`GETPRO_SESSION_STORE`** | Unset: use **Postgres** sessions if `DATABASE_URL` is set, else SQLite file. `pg`: force Postgres (requires URL). `sqlite`: force SQLite `sessions.db` even when Postgres is configured (e.g. local debugging). |

Table: **`public.session`** (created automatically if missing when using Postgres).

## Pool tuning (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `GETPRO_PG_POOL_MAX` | `10` | Max clients in the pool (`pg` `Pool`). |
| `GETPRO_PG_IDLE_MS` | `30000` | `idleTimeoutMillis`. |
| `GETPRO_PG_CONNECT_TIMEOUT_MS` | `10000` | `connectionTimeoutMillis`. |

## Connectivity checks (no app data migration)

| Mechanism | How |
|-------------|-----|
| **CLI** | `npm run test:pg` — runs `SELECT current_database()`; exits `0` with a skip message if no URL is set (safe for CI). |
| **HTTP (opt-in)** | Set **`GETPRO_PG_HEALTH_ROUTE=1`**, then `GET /api/debug/pg-ping` returns JSON with `ok`, `database`, `schema` or an error. **Disabled by default** so production does not expose this route accidentally. |

## Callback interests (PostgreSQL primary when connected)

When **`DATABASE_URL`** / **`GETPRO_DATABASE_URL`** is set and **`public.callback_interests`** exists, **`POST /api/callback-interest`** and admin **Leads** partner callbacks read/write Postgres (not SQLite for those rows). No extra env flag.

## Code location

- Pool: `src/db/pg/pool.js` (`getPgPool`, `isPgConfigured`, `closePgPool`)
- Re-export: `src/db/pg/index.js`
- Callbacks: `src/db/pg/callbacksRepo.js`
