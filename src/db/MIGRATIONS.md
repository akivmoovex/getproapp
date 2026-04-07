# Legacy SQLite migrations (removed from tree)

**Runtime:** **`server.js`** is **PostgreSQL-only**. **`src/db/index.js`** remains a **stub/guard** (throws on legacy SQLite-style `db` access).

The former on-disk SQLite stack lived here:

- `schema.js`, `indexes.js`, `seeds.js`
- `migrations/*.js` (numbered steps + `migrations/index.js`)
- helpers such as `src/companies/companySearchFts.js`

Those files were **intentionally deleted** from current branches so the repo is not mistaken for an active SQLite codebase. **Recover them from Git history** (search paths above) if you need DDL/migration archaeology.

**Production schema:** apply and evolve **`db/postgres/*.sql`**; application I/O: **`src/db/pg/`**.

See **`docs/SQLITE_RUNTIME_CUTOVER.md`**.
