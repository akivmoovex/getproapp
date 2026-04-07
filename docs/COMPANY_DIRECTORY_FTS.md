# Company directory search and legacy SQLite FTS5

## Current behavior (production)

Directory text search (`GET /directory` with `q` and/or `city`, no `category` slug) uses **PostgreSQL only**:

| Store | Implementation | Columns | Order |
|-------|----------------|---------|--------|
| **PostgreSQL** | `ILIKE '%term%'` on `name`, `headline`, `about`; optional location `ILIKE` for city | Same three + location | `ORDER BY c.name ASC` |

Tenant scoping: `c.tenant_id = $1`. Whitelist rules for `q` and `city` are unchanged (`isWhitelistedService` / `isWhitelistedCity` in `src/routes/public.js`).

Code: `src/db/pg/companiesRepo.js` → `listDirectorySearchIlike`; `src/routes/public.js` invokes the repo with `getPgPool()`.

**There is no SQLite or hybrid directory-search path** in the running server (`DATABASE_URL` / `GETPRO_DATABASE_URL` is required).

## Legacy: `companies_fts` (FTS5, SQLite file only)

Historically, migration **`14-company-directory-fts.js`** (removed from tree; **Git history**) defined the virtual table `companies_fts` and triggers for **legacy on-disk SQLite** DDL. **The app does not query FTS** for live directory search.

- **`npm run rebuild-company-fts`** and other SQLite maintenance npm scripts were **removed** with **`better-sqlite3`**. Optional work on a standalone `.sqlite` file is **outside** this repo (custom harness or **Git history**).
- To drop FTS from an old SQLite file, use SQLite tooling directly; not applicable to production PostgreSQL.

## Historical: FTS5 vs substring search

FTS5 (token/prefix, BM25) was removed from the **read path** in favor of **substring** `ILIKE` and **name** ordering.

| Topic | FTS5 (legacy SQLite artifact) | Current PostgreSQL |
|--------|-------------------------------|---------------------|
| Multi-word query | AND across word tokens (prefix) | Entire `q` (after whitelist) as substring in one of the text columns |
| Ranking | BM25 then name | Name only |
| Short / prefix | `"plumb"*` could match “plumber” | Substring: “plumb” matches “plumbing” if contained |

## Unicode note

PostgreSQL `ILIKE` follows database locale. Any historical note about SQLite `LIKE COLLATE NOCASE` applies only to **offline SQLite files**, not the production server.
