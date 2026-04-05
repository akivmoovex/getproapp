# Database bootstrap and migrations

## Layout

| Module | Role |
|--------|------|
| `connect.js` | Resolve `SQLITE_PATH`, create parent dirs, `better-sqlite3`, WAL + foreign_keys |
| `schema.js` | `_getpro_migrations` table, original core tables, canonical tenant `INSERT OR IGNORE` |
| `seeds.js` | Shared `seedCategoriesForTenant` (used by category migrations / repeatable seeds) |
| `migrations/*.js` | Ordered steps (legacy PRAGMA alters, registered migrations, every-boot tweaks) |
| `queryHelpers.js` | `run` / `getOne` / `getAll` wrappers |
| `indexes.js` | `applyBaseIndexes(db)` — core `companies` / `leads` indexes (idempotent) |
| `index.js` | Boot: open → base schema → base indexes → `runAllMigrations` → export API |

## Registry

`migrations/index.js` exports `STEPS`: an explicit array applied top-to-bottom. Each file default-exports `function run(db) { ... }` with the same `try/catch` bodies as the old `db.js`.

## What was kept vs retired

- **Kept (unchanged semantics):** All SQL, `_getpro_migrations` ids, conditional `ALTER`/rebuild logic, and “runs every startup” blocks (e.g. regional category copy, global/demo `seedCategoriesForTenant`, tenants contact columns without a migration row).
- **Retired:** The monolithic `src/db.js` implementation body; it is replaced by this tree. Callers use `require("./src/db")`, which Node resolves to **`src/db/index.js`** (no separate shim file).
- **Not simplified:** Despite an almost-empty DB being possible, no schema was collapsed or tables dropped; order and idempotence match the prior file.

## Legacy vs registered

- **Pre-registry legacy (no `_getpro_migrations` row):** `01-legacy-pragma-alters.js` — `PRAGMA table_info` driven alters and table rebuilds from early product evolution.
- **Registered migrations:** Steps that check/insert `_getpro_migrations` (named `*_v1`, etc.).
- **Repeatable / every boot:** e.g. `03-categories-and-repeatable-seeds.js` (partial), `10-tenants-contact-and-demo-fixes.js` (tenant contact columns block without migration id).
- **Directory FTS:** `14-company-directory-fts.js` — `companies_fts` (FTS5) + triggers; see `docs/COMPANY_DIRECTORY_FTS.md` and `src/companies/companySearchFts.js` (`rebuildCompanySearchFts`).
- **Query indexes:** `15-query-pattern-indexes.js` — evidence-based indexes; see `docs/SQLITE_INDEX_STRATEGY.md`.
- **Drop redundant:** `16-drop-redundant-indexes.js` — removes indexes superseded by migration 15 (see same doc).

## Editing migrations (maintainers)

Change the numbered files under `migrations/` directly. The old one-off splitter script used when extracting from the monolithic `db.js` has been removed as obsolete.
