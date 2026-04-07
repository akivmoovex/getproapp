# Supabase / PostgreSQL migration backlog

Rules: SQLite stays authoritative until a stage explicitly cuts over. No Prisma. Reversible slices.

## Sensitive (extra tests / review before cutover)

| Area | Why |
|------|-----|
| **Category listing** | Public `/category/*` and admin category CRUD; tenant-scoped. |
| **Review stats** | `reviewStats.js` aggregates; numeric parity required. |
| **Search / FTS** | `companies_fts` → `tsvector` / pg_trgm / external search; query semantics. |
| **Admin writes** | Companies, tenants, super-admin deletes, PRAGMA patterns. |
| **Tenant routing** | `src/tenants/index.js`, host/subdomain resolution. |

## Safest quick wins

- Stage A: PG pool + connectivity (`src/db/pg/pool.js`, `npm run test:pg`) — **done**
- **Slice 1:** `callback_interests` — API insert + admin Leads list use Postgres when `DATABASE_URL` is set (see `docs/SUPABASE_SLICE1_CALLBACKS.md`)
- Future: `professional_signups` (similar API-only insert + CRM side effect stays SQLite)
- Verification scripts: row counts per `tenant_id` for mirrored tables

## Medium risk

- `leads` + `lead_comments` (FK chain, CRM `source_ref_id`)
- `crm_tasks` / `crm_audit_logs` (workflow)
- Intake tables (transactions, datetime logic)
- `content_pages`, `categories`, `companies` (volume + FKs)

## Larger / later

- `companies_fts` + directory search
- `tenants` + session store migration
- Remove SQLite dependencies (final cutover)
