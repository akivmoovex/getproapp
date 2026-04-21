# PostgreSQL / Supabase schema (incremental)

Apply SQL files manually in Supabase (**SQL** → **New query**) or via `psql "$DATABASE_URL" -f ...`. After applying `000_full_schema.sql`, verify from your repo with **`npm run check:pg`** (core tables + connection).

| File | Purpose |
|------|---------|
| `000_full_schema.sql` | **Full app schema** (all tables) for a new PostgreSQL database. |
| `001_callback_interests.sql` | Legacy: single table for `callback_interests` only. Superseded by `000_full_schema.sql` for greenfield setups. |
| `002_field_agent.sql` | Field agent accounts, provider submissions (pending/approved/rejected), and “call me back” leads. Apply after `000_full_schema.sql`. Moderation behavior and CRM linkage: **`docs/field-agent-moderation.md`**. |
| `003_tenant_phone_rules.sql` | Per-tenant phone validation/normalization columns on `tenants` + seeds for `zm` / `demo`. Apply after `000` (and after `002` if you use field agents). The Node server also runs this idempotently at startup (`ensureTenantPhoneRulesSchema` in `server.js`) so production DBs are not missing `phone_*` columns. |

The **Express** app **requires** `DATABASE_URL` / `GETPRO_DATABASE_URL`; application I/O is PostgreSQL-only.

**SQLite → PostgreSQL bulk copy:** **Not supported in current branches** — `scripts/migrate-sqlite-to-pg/*`, verify/backfill helpers, and **`better-sqlite3`** were **removed**. Recover tooling from **Git history** if needed. **`docs/SQLITE_TO_PG_DATA_MIGRATION.md`** is **historical** only.

See also **`docs/SUPABASE_SLICE1_CALLBACKS.md`**, **`docs/SUPABASE_MIGRATION_BACKLOG.md`**.

## Automated tests (dedicated Postgres)

For CI or local integration tests, use a **separate empty database** (not your dev DB):

1. Create database (e.g. `getpro_test`) and set **`GETPRO_TEST_DB=1`** + **`TEST_DATABASE_URL`** (see repo root **`env.test.example`**). With this flag, **`DATABASE_URL` / `GETPRO_DATABASE_URL` are ignored** so `.env` cannot point tests at dev by accident.
2. Apply schema once: **`npm run test:db:schema`** (runs `scripts/apply-test-db-schema.js`: `000_full_schema.sql`, then numbered `NNN_*.sql` excluding duplicate `* 2.sql` files, then canonical tenant seed).
3. Run Node tests against that URL: **`npm run test:pg:isolated`** (optional: pass file paths after `--`). Or: `GETPRO_TEST_DB=1 TEST_DATABASE_URL=... node --test tests/...`.

Seed helpers for field agents, submissions, CRM tasks, and companies live in **`tests/helpers/pgTestSeed.js`**.
