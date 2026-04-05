# Company directory FTS5 search

## Previous vs current (text matching)

| Aspect | Before (LIKE) | After (FTS5) |
|--------|----------------|--------------|
| Text columns | `name`, `headline`, `about` (same) | Same columns in `companies_fts` |
| Match semantics | One pattern `%q%` must appear as a **substring** in any column | Whitespace-separated **tokens**; each token is a **prefix** query on FTS tokens (`"token"*`), combined with **AND** across tokens |
| Order | `ORDER BY c.name ASC` | `ORDER BY bm25(companies_fts) ASC, c.name ASC` (relevance, then name) |
| City / tenant | `city` → `location LIKE`; `tenant_id` filter unchanged | Unchanged (still `LIKE` on `location`; tenant on `c.tenant_id`) |
| Category browse | `category` query param → slug filter only | Unchanged |

## Schema

- Virtual table: `companies_fts` (FTS5), columns `name`, `headline`, `about`.
- **rowid** = `companies.id` (enforced by triggers and rebuild).
- Tokenizer: `unicode61 remove_diacritics 2` with `prefix='2 3 4'` for efficient prefix matches (not Porter stemming, to stay closer to literal word matching).

## Sync strategy

1. **Triggers** (see migration `14-company-directory-fts.js`):
   - `AFTER INSERT ON companies` → insert FTS row.
   - `AFTER DELETE ON companies` → FTS delete by rowid.
   - `AFTER UPDATE OF name, headline, about` → delete old rowid, insert new row (id stable).
2. **Initial / bulk repair**: `rebuildCompanySearchFts(db)` in `src/companies/companySearchFts.js` runs `DELETE FROM companies_fts` then repopulates from `SELECT id, name, headline, about FROM companies`.
3. **Boot self-heal**: After migrations, `ensureCompanyDirectoryFtsInSync(db)` (from `src/db/index.js`) compares `COUNT(*)` on `companies` vs `companies_fts` when migration `company_directory_fts_v1` is present. If counts differ, it logs a warning and runs `rebuildCompanySearchFts` once (covers failed first rebuild, restores, or bulk SQL without triggers).
4. **CLI**: `npm run rebuild-company-fts` loads the app DB module and runs a full FTS rebuild (same as calling `rebuildCompanySearchFts` in code).
5. **Assumption**: Routine app traffic keeps FTS current via triggers. Prefer rebuild after offline DB surgery.

## Read path

- `src/routes/public.js` `/directory` when `q` and/or `city` (and no `category` slug filter): uses FTS **only if** `companies_fts` exists **and** `buildCompanyDirectoryFtsMatch(q)` returns non-null.
- If the FTS table is missing (migration failed) or the query has no letter/number tokens after sanitization → **LIKE fallback** (same as legacy).
- If FTS `MATCH` / `bm25()` throws at runtime → request falls back to LIKE for that request only (defensive).

## User-visible differences

- **Prefix / tokens**: Searching `plumb` can match token `plumber` via prefix `plumb*`. Very short inputs may match broadly.
- **Multi-word**: `spark lusaka` requires both tokens to appear somewhere in the indexed text (any of the three columns), not necessarily as the exact substring `spark lusaka`.
- **Punctuation**: Characters stripped from tokens (only letters/numbers kept per token) vs substring across punctuation.
- **Ranking**: More relevant rows (per BM25) appear earlier; previously sorting was alphabetical only.

## Manual test matrix

| Case | Steps | Expected |
|------|--------|----------|
| FTS cold start | New DB, boot app, open directory | No errors; migration log line; search works |
| Single word | `q=electric` | Listings whose tokenized text matches prefix `electric` |
| Multi-word | `q=spark lusaka` | Rows containing both token groups (any column) |
| City only | `city=Lusaka` no `q` | `location LIKE` only, no FTS join |
| Text + city | `q=plumb` `city=Lusaka` | FTS + location filter |
| Whitelist | Same as before (`isWhitelistedService` / city lists) | Invalid `q`/`city` cleared from SQL |
| Category + city | `category=plumbers` + `city=…` | Unchanged SQL path (no FTS for `q` in that branch) |
| Rebuild | After manual SQLite copy/paste of companies | `npm run rebuild-company-fts`, or next app boot auto-repairs if counts drift |

## Rollback

1. Remove FTS join / `MATCH` / `bm25` from `src/routes/public.js` (restore LIKE-only block).
2. `DROP TRIGGER IF EXISTS companies_fts_ai;` (and `ad`, `au`).
3. `DROP TABLE IF EXISTS companies_fts;`
4. `DELETE FROM _getpro_migrations WHERE id = 'company_directory_fts_v1';`
5. Remove migration file `14-company-directory-fts.js` from `STEPS`, delete `src/companies/companySearchFts.js`, remove `ensureCompanyDirectoryFtsInSync` from `src/db/index.js`, and remove the `rebuild-company-fts` script from `package.json` if desired.
