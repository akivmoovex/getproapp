# SQLite index strategy (evidence-based)

Indexes are added only where real application queries show `WHERE` / `JOIN` / `ORDER BY` patterns. Speculative indexes are avoided.

## Pre-implementation: table → pattern → support → proposal

| Table | Query pattern (source) | Previous index support | Proposed index | Benefit | Risk |
|-------|------------------------|------------------------|----------------|---------|------|
| **companies** | `WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 24/500` (`public.js` directory, `seoPublic.js`) | `idx_companies_category_id` only | `(tenant_id, updated_at)` | Fast tenant-scoped “latest listings” without full table scan + sort | Extra write cost on `updated_at` changes |
| **companies** | `WHERE tenant_id = ? ORDER BY name ASC` (directory search, FTS/LIKE, `adminDirectory.js` company list) | None on `name` | `(tenant_id, name)` | Matches sort order for search results and admin dropdowns | Writes on name changes |
| **companies** | `WHERE tenant_id = ? AND category_id = ?` (`public.js` `/category/...`, `intakeProjectAllocation.js`) | `idx_companies_category_id` on `category_id` alone | `(tenant_id, category_id)` | Planner can seek tenant then category without scanning other tenants’ categories | **See redundancy note below** |
| **leads** | `WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200` (`adminDirectory.js`) | `idx_leads_tenant_id` | `(tenant_id, created_at)` | Avoids sorting up to 200 rows per tenant | **Redundant with `idx_leads_tenant_id` for prefix-only lookups** (see below) |
| **leads** | `WHERE tenant_id = ? AND company_id = ? ORDER BY created_at DESC` (`adminDirectory.js`) | `idx_leads_company_id` | `(tenant_id, company_id, created_at)` | Company-scoped lead timeline | Slightly more write overhead than single-column `company_id` alone |
| **callback_interests** | `WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200` | `idx_tenant_cities`-style none; only implicit | `(tenant_id, created_at)` | Admin partner callbacks list | Low row volume typical |
| **professional_signups** | `WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200` | None | `(tenant_id, created_at)` | Admin join signups list | Low row volume typical |
| **categories** | `WHERE tenant_id = ? ORDER BY sort, name` (`public.js` home cache, directory) | `idx_categories_tenant_id` | `(tenant_id, sort, name)` | Frequent cached home/directory category strip | Writes on sort/name |
| **content_pages** | `WHERE tenant_id = ? AND kind = ? AND published = 1 ORDER BY sort_order, title` (`contentPages.js`) | `idx_content_pages_tenant_kind`, `idx_content_pages_published` | `(tenant_id, kind, published, sort_order)` | Homepage / listing published content | Overlaps partially with existing indexes (kept for safety) |
| **reviews** | `WHERE company_id = ? … ORDER BY created_at / rating` (`reviewStats.js` subqueries) | `idx_reviews_company_id`, `idx_reviews_created_at` | `(company_id, created_at)` | Correlated stats per company in directory batches | Small extra vs `company_id` alone |
| **tenant_cities** | `WHERE tenant_id = ? ORDER BY name COLLATE NOCASE` (`tenantCities.js`, `adminDirectory.js`) | `idx_tenant_cities_tenant_id` | `(tenant_id, name COLLATE NOCASE)` | Aligns with case-insensitive sort | NOCASE index maintenance |
| **intake_client_projects** | `WHERE tenant_id = ?` + date/status filters + `ORDER BY created_at` default (`adminIntakeProjectStatus.js`) | `idx_intake_projects_tenant_client` | `(tenant_id, created_at)` | Default sort for large intake lists | Writes on `created_at` updates |

## Implementation summary

### Indexes added (`query_pattern_indexes_v1`)

- `idx_companies_tenant_updated_at`
- `idx_companies_tenant_name`
- `idx_companies_tenant_category`
- `idx_leads_tenant_created_at`
- `idx_leads_tenant_company_created`
- `idx_callback_interests_tenant_created`
- `idx_professional_signups_tenant_created`
- `idx_categories_tenant_sort_name`
- `idx_content_pages_tenant_kind_published_sort`
- `idx_reviews_company_created`
- `idx_tenant_cities_tenant_name`
- `idx_intake_client_projects_tenant_created`

### Indexes kept (base + earlier migrations)

- `src/db/indexes.js`: **`idx_leads_company_id` only** (companies `category_id`-only index removed; use `idx_companies_tenant_category` from migration 15).
- CRM, intake, portal, FTS, and other migration indexes unchanged.

### Redundant indexes removed (`drop_redundant_indexes_v1`, migration 16)

| Dropped index | Replacement |
|---------------|-------------|
| `idx_companies_category_id` | `idx_companies_tenant_category` |
| `idx_leads_tenant_id` | `idx_leads_tenant_created_at` |
| `idx_reviews_created_at` | `idx_reviews_company_created` |

Creation paths updated so **new** installs do not recreate the dropped indexes (`indexes.js`, `01-legacy-pragma-alters.js`, `05-reviews.js`).

### Still kept (not redundant with migration 15)

| Index | Reason |
|-------|--------|
| `idx_content_pages_tenant_kind` / `idx_content_pages_published` | `seoPublic` uses `tenant_id + published` without `kind`; the 4-column index does not subsume that path |

## How to inspect (SQLite)

```sql
.indexes companies
.indexes leads
EXPLAIN QUERY PLAN
  SELECT * FROM companies WHERE tenant_id = 4 ORDER BY updated_at DESC LIMIT 24;
EXPLAIN QUERY PLAN
  SELECT * FROM leads WHERE tenant_id = 4 ORDER BY created_at DESC LIMIT 200;
```

Use `sqlite3 /path/to/getpro.sqlite` or any GUI. Confirm `SEARCH` / `USING INDEX` references the new names.

## Manual verification

1. Boot app — migration log lines for `query_pattern_indexes_v1` and `drop_redundant_indexes_v1` (on first run after upgrade).
2. Open tenant directory (default list, category, search), admin Leads, admin Cities, admin intake list — no errors, sensible latency.
3. Run `EXPLAIN QUERY PLAN` on 2–3 representative queries from the table above.

## Rollback

**Query indexes only:** `DROP INDEX IF EXISTS` each name from migration 15; `DELETE FROM _getpro_migrations WHERE id = 'query_pattern_indexes_v1';` remove step 15 from `STEPS`.

**Restore dropped legacy indexes:** `DELETE FROM _getpro_migrations WHERE id = 'drop_redundant_indexes_v1';` remove step 16; restore `CREATE INDEX` lines in `indexes.js`, `01-legacy-pragma-alters.js`, and `05-reviews.js`; recreate indexes manually or re-run those statements.

No application logic depends on specific index names (optimization-only).
