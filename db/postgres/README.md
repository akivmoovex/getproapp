# PostgreSQL / Supabase schema (incremental)

Apply SQL files manually in Supabase (**SQL** → **New query**) or via `psql "$DATABASE_URL" -f ...`. After applying `000_full_schema.sql`, verify from your repo with **`npm run check:pg`** (core tables + connection).

| File | Purpose |
|------|---------|
| `000_full_schema.sql` | **Full app schema** (all tables) for a new PostgreSQL database. |
| `001_callback_interests.sql` | Legacy: single table for `callback_interests` only. Superseded by `000_full_schema.sql` for greenfield setups. |
| `002_field_agent.sql` | Field agent accounts, provider submissions (pending/approved/rejected), and “call me back” leads. Apply after `000_full_schema.sql`. |
| `003_tenant_phone_rules.sql` | Per-tenant phone validation/normalization columns on `tenants` + seeds for `zm` / `demo`. Apply after `000` (and after `002` if you use field agents). |

The **Express** app **requires** `DATABASE_URL` / `GETPRO_DATABASE_URL`; application I/O is PostgreSQL-only.

**SQLite → PostgreSQL bulk copy:** **Not supported in current branches** — `scripts/migrate-sqlite-to-pg/*`, verify/backfill helpers, and **`better-sqlite3`** were **removed**. Recover tooling from **Git history** if needed. **`docs/SQLITE_TO_PG_DATA_MIGRATION.md`** is **historical** only.

See also **`docs/SUPABASE_SLICE1_CALLBACKS.md`**, **`docs/SUPABASE_MIGRATION_BACKLOG.md`**.
