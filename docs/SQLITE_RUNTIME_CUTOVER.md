# SQLite runtime cutover (current state)

**Tooling retirement is complete** in this repository: no `better-sqlite3`, no SQLite migration/verify/backfill scripts, no matching npm commands.

Express is **PostgreSQL-only** for application data and sessions.

**`better-sqlite3`** existed in this repo **only** to power the now-removed SQLite → PG migration, verify, and backfill scripts. It is **not** a dependency today, and **no** supported npm workflow in this tree opens a SQLite application database.

## Runtime

| Surface | Behavior |
|---------|----------|
| **Process start** | **`DATABASE_URL` or `GETPRO_DATABASE_URL` is required** — `server.js` exits if unset. |
| **Application database** | **PostgreSQL** via **`src/db/pg/*`** and `getPgPool()`. |
| **`src/db/index.js`** | **Does not open SQLite.** Stub `db` Proxy + throwing helpers (`run`, `getOne`, `getAll`, `getSqliteDb`). |
| **Sessions** | **PostgreSQL** — **`connect-pg-simple`**, table **`public.session`**. |
| **`better-sqlite3`** | **Removed from the project.** No npm dependency; no migration/backfill scripts in this repo. |

## Legacy SQLite DDL/migrations (removed from tree)

**`src/db/schema.js`**, **`indexes.js`**, **`seeds.js`**, **`migrations/**`**, and **`src/companies/companySearchFts.js`** were **deleted** from current branches so the repo is clearly **not** an active SQLite project. **Recover from Git history** if you need that source. See **`src/db/MIGRATIONS.md`**.

## Historical tooling (removed — unsupported here)

The following were **deleted** from the repository. They are **not maintained, tested, or documented as supported** in current branches; recover copies only from **Git history** or an archived release if you still need them.

- **`scripts/migrate-sqlite-to-pg/**`**
- **`scripts/verify-sqlite-pg-counts.js`**
- **`scripts/backfill-callback-interests-from-sqlite.js`**
- **`scripts/verify-callback-interests-sqlite-pg.js`**
- Related **`package.json`** scripts and the **`better-sqlite3`** dependency

**`SQLITE_PATH` / `data/getpro.sqlite`** are only relevant if you maintain an offline SQLite file yourself; Express does not read them.

## Environment (cutover-related)

| Variable | Role |
|----------|------|
| `DATABASE_URL` / `GETPRO_DATABASE_URL` | **Required** for the server. |
| `GETPRO_ALLOW_SQLITE_WITH_PG` | **Forbidden in production** when PG is configured (`verifyProductionPgOnlyRuntime()`). |

Sessions use **`connect-pg-simple`**, not **`better-sqlite3-session-store`** (never listed in `package.json`).
