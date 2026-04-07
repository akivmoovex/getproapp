# `callback_interests` on PostgreSQL (slice 1 — primary)

## Behavior

When **`DATABASE_URL`** or **`GETPRO_DATABASE_URL`** is set and the pool connects successfully:

- **`POST /api/callback-interest`** inserts into **`public.callback_interests`** only.
- **Admin → Leads** (“Potential partners — Call me”) lists callbacks from PostgreSQL.
- **CRM auto-task** (`createCrmTaskFromEvent` in `src/crm/crmAutoTasks.js`) writes **`public.crm_tasks`** via **`crmTasksRepo`**; `source_ref_id` holds the **`callback_interests.id`** from PostgreSQL.

The server **requires** a Postgres URL; there is no supported “SQLite-only” runtime for this app.

## Prerequisites

- Schema: **`db/postgres/000_full_schema.sql`** (recommended) or **`db/postgres/001_callback_interests.sql`**.
- **`public.tenants`** must contain the tenant id used in the request (FK). Migrate tenants to Postgres or inserts will fail with **503** on the API.

## Historical data

Existing rows in a legacy SQLite file are **not** copied by this repository (SQLite tooling was removed). Use **`docs/SQLITE_TO_PG_DATA_MIGRATION.md`** and Git history for the old copy procedures, or export/import manually.

## Rollback

Running without **`DATABASE_URL`** / **`GETPRO_DATABASE_URL`** is **not supported** (`server.js` exits). To abandon PostgreSQL for callbacks, you would need an older app revision and data strategy — out of scope here.

## Removed

- **`GETPRO_PG_DUAL_WRITE_CALLBACKS`** — no longer used; Postgres is either primary (when configured) or not used for this feature.

## Files

- `src/db/pg/callbacksRepo.js` — insert + admin list
- `src/routes/api.js` — `POST /api/callback-interest`
- `src/routes/admin/adminDirectory.js` — `GET /admin/leads` (partner callbacks section)
- (Removed) SQLite backfill / verify scripts — recover from Git history if needed.
