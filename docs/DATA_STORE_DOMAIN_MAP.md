# Data store domain map (PostgreSQL vs SQLite)

## Current runtime (authoritative)

- **`node server.js` requires PostgreSQL** (`DATABASE_URL` / `GETPRO_DATABASE_URL`) and **does not open SQLite**.
- **`src/db/index.js`** is a **stub** (throws on SQLite-style `db` access); it does **not** load **`better-sqlite3`**.
- **Sessions** use **PostgreSQL** (`connect-pg-simple`, `public.session`).
- **`better-sqlite3`** is **not** in this repository. See **`docs/SQLITE_RUNTIME_CUTOVER.md`**.

## Historical matrix (stale)

**Purpose (original):** Map domains during the SQLite → PostgreSQL migration.

**Status:** The table below reflects an **older hybrid audit** and is **not maintained** as the live description of each handler’s store. For **current** application I/O, inspect **`src/db/pg/*Repo.js`**, route modules, and **`server.js`**. Legacy SQLite DDL/migrations (`src/db/schema.js`, `src/db/migrations/`, etc.) were **removed** from the tree; use **Git history** if needed (`better-sqlite3` is not in this repo).

**Method (historical):** Derived from `db/postgres/000_full_schema.sql`, former `src/db/schema.js` / `migrations/` (removed), `src/db/pg/*Repo.js`, and routes.

**Cutover column:** Treated as historical; do not use this document alone for production architecture decisions.

**Deprecated labels in the table:** Rows that cite **Hybrid** or **SQLite** as the live application store reflect an **older audit**, not the current **PostgreSQL-only** Express server. Prefer source code over this matrix.

| Domain / table | PostgreSQL | SQLite | Current primary store in production code | Evidence files | Cutover complete? | Notes |
|----------------|------------|--------|------------------------------------------|----------------|-------------------|-------|
| `_getpro_migrations` | Yes (`public._getpro_migrations`) | Yes | **Both** (separate stores) | `db/postgres/000_full_schema.sql`; Git history for old SQLite migrations | **no** | Schema/meta per engine; not application data. |
| `tenants` | Yes (`public.tenants`); read helpers | Yes | **Stale row** — use code | `src/tenants/index.js`; `src/db/pg/tenantsRepo.js`; `src/routes/admin/adminSuper.js` | **n/a** | Matrix not maintained; runtime is PG-first. |
| `admin_users` | Yes | Yes | **SQLite** | `src/auth/index.js`; `src/routes/admin/adminAuth.js`; `src/routes/admin/adminSuper.js`; `src/routes/admin/adminTenantUsers.js`; `src/db/pg/crmTasksRepo.js` (PG reads for CRM assignees) | **no** | PG schema and CRM queries reference `public.admin_users`; bootstrap user creation is SQLite (`ensureAdminUser`). |
| `admin_user_tenant_roles` | Yes | Yes | **SQLite** | `src/auth/adminUserTenants.js`; `src/routes/admin/adminTenantUsers.js`; `src/db/pg/crmTasksRepo.js` | **no** | |
| `categories` | Yes (`categoriesRepo`) | Yes | **Stale row** | `src/db/pg/categoriesRepo.js`; `src/routes/admin/adminDirectory.js`; `src/routes/public.js` | **n/a** | Matrix not maintained; runtime is PG-first. |
| `companies` | Yes (`companiesRepo`) | Yes | **Stale row** | `src/db/pg/companiesRepo.js`; `src/routes/*` | **n/a** | Matrix not maintained. |
| `companies_fts` (FTS5 virtual) | **No** | Yes | **SQLite file / legacy only** | Git history (`14-company-directory-fts.js`, `companySearchFts.js`) | **n/a** | Not used by current server; directory search uses PostgreSQL ILIKE/LIKE. |
| `leads` | Yes (`leadsRepo`) | Yes | **Hybrid** | `src/db/pg/leadsRepo.js`; `src/routes/api.js` (POST inserts **SQLite** `INSERT INTO leads`); `src/routes/admin/adminDirectory.js` | **no** | Public API lead creation is SQLite-only in `api.js` even when company lookup uses PG. |
| `lead_comments` | Yes (`leadsRepo`) | Yes | **Hybrid** | `src/db/pg/leadsRepo.js`; `src/routes/admin/adminDirectory.js` (`db.prepare` fallback) | **no** | |
| `professional_signups` | Yes (`professionalSignupsRepo`) | Yes | **SQLite** for inbound API; **hybrid** for admin reads | `src/routes/api.js` (SQLite insert); `src/db/pg/professionalSignupsRepo.js`; `src/routes/admin/adminDirectory.js` | **no** | |
| `callback_interests` | Yes (`callbacksRepo`) | Yes | **Stale row** | `src/routes/api.js`; `src/db/pg/callbacksRepo.js` | **n/a** | Matrix not maintained. |
| `reviews` | Yes (`reviewsRepo`) | Yes | **Hybrid** (reads) | `src/db/pg/reviewsRepo.js`; `src/companies/reviewStats.js`; `src/companies/companyPageRender.js`; `src/intake/intakeProjectAllocation.js`; SQLite `reviews` in fallbacks | **no** | Matrix stale; legacy SQLite seed was in removed `migrations/05-reviews.js` (Git history). |
| `tenant_cities` | Yes (`tenantCitiesRepo`) | Yes | **Hybrid** | `src/db/pg/tenantCitiesRepo.js`; `src/routes/admin/adminDirectory.js` | **no** | |
| `crm_tasks` | Yes (`crmTasksRepo`) | Yes | **Hybrid** | `src/db/pg/crmTasksRepo.js`; `src/routes/admin/adminCrm.js`; `src/crm/crmAutoTasks.js` (SQLite **`INSERT INTO crm_tasks` only**) | **no** | Auto tasks from API events always write SQLite (`crmAutoTasks.js`). |
| `crm_task_comments` | Yes (`crmTasksRepo`) | Yes | **Hybrid** | `src/db/pg/crmTasksRepo.js`; `src/routes/admin/adminCrm.js` | **no** | |
| `crm_audit_logs` | Yes (`crmAuditRepo` via `crmTasksRepo`) | Yes | **Hybrid** | `src/db/pg/crmAuditRepo.js`; `src/crm/crmAudit.js` (SQLite `insertCrmAudit`); `src/routes/admin/adminCrm.js` (SQLite path calls `insertCrmAudit`) | **no** | PG CRM mutations use `crmAuditRepo`; SQLite CRM path uses `crmAudit.js`. |
| `content_pages` | Yes (DDL in `000_full_schema.sql`) | Yes | **Stale row** | `src/db/pg/contentPagesRepo.js`; `src/routes/public.js`; `src/routes/admin/adminDashboardContent.js` | **n/a** | Matrix not maintained. |
| `intake_code_sequences` | Yes | Yes | **SQLite** | `src/intake/clientProjectIntake.js`; `src/routes/admin/adminIntake.js` | **no** | No PG repo in `src/db/pg/`. |
| `intake_clients` | Yes | Yes | **SQLite** | `src/intake/*`; `src/routes/admin/adminIntake.js` | **no** | |
| `intake_client_projects` | Yes | Yes | **SQLite** | Same | **no** | |
| `intake_project_images` | Yes | Yes | **SQLite** | Same; `src/routes/companyPortal.js` | **no** | |
| `intake_phone_otp` | Yes | Yes | **SQLite** | `src/routes/admin/adminIntake.js` | **no** | |
| `intake_category_lead_settings` | Yes | Yes | **SQLite** | Git history `13-nrz-intake-lifecycle-credits.js`; matrix stale | **no** | |
| `intake_allocation_settings` | Yes | Yes | **SQLite** | Same | **no** | |
| `company_personnel_users` | Yes | Yes | **SQLite** | `src/auth/companyPersonnelAuth.js`; `src/routes/admin/adminIntake.js` | **no** | |
| `intake_project_assignments` | Yes | Yes | **SQLite** | `src/routes/companyPortal.js`; `src/intake/intakeProjectAllocation.js` | **no** | |
| `company_portal_credit_accounts` | Yes | Yes | **SQLite** | `src/companyPortal/companyPortalCreditLedger.js` (`db.prepare`) | **no** | PG DDL in `000_full_schema.sql`; **no** `src/db/pg` repo—runtime ledger/account writes are SQLite. |
| `company_portal_credit_ledger_entries` | Yes | Yes | **SQLite** | `src/companyPortal/companyPortalCreditLedger.js` | **no** | Same as above. |
| `session` (express-session) | Yes (`public.session`, `connect-pg-simple`) | — | **PostgreSQL** (current `server.js`) | `server.js` (session middleware); `docs/SQLITE_RUNTIME_CUTOVER.md` | **yes** (runtime) | Table **`session`**; not in `000_full_schema.sql` until created by `connect-pg-simple`. |

## Uncertainties / limits of this doc

- **The matrix is stale** relative to PostgreSQL-first runtime — use source code for truth.
- **Row-level parity** between SQLite and PostgreSQL is **not** asserted; in-repo SQLite → PG scripts were **removed**.
- **`reviews` runtime writes:** Inserts were not found in route handlers in the original audit; treat as **unclear** unless re-verified.
- **Search:** User-facing directory search does not rely on SQLite `companies_fts` in production (PG ILIKE/LIKE); see `docs/COMPANY_DIRECTORY_FTS.md`.

## Related documentation

- `docs/SQLITE_RUNTIME_CUTOVER.md` — PostgreSQL-only runtime vs legacy SQLite scripts.
- `docs/SQLITE_TO_PG_DATA_MIGRATION.md` — **historical** narrative of removed SQLite → PG scripts (not runnable from current tree).
- `docs/DATA_MODEL.md` — conceptual model (note: it refers to a “sessions” table for SQLite; PG uses `session` via `connect-pg-simple`).
- `db/postgres/000_full_schema.sql` — target PostgreSQL DDL.
