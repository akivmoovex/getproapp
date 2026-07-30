# Prompt 7 Stage 1 — Branch website governance & scope foundation

**Status:** Additive migration ready (local ephemeral tests).  
**Do not deploy automatically.**  
**Database identity required:** `blessboard-platform-v5` / `environment_code=testing`

## Goals

1. Org master switches: `allow_branch_giving_methods`, `allow_branch_urgent_updates` (default **false**).
2. Per-branch `branch_website_governance` with `branch_publish_mode` (`hq_approval` | `trusted_direct`, default `hq_approval`).
3. Field-level `website_scope_settings` foundation (override / hidden; no row = inherit).
4. Church-wide public URLs use **church-scoped content only** (do not mirror primary branch pages).
5. Primary branch may supply **contact** and **service times** fallbacks only when church-wide values are absent.
6. Preserve existing branch CMS rows; do not bulk-copy church content.

## Migration

| Order | File | Effect |
|------:|------|--------|
| **052** | `db/migrations/blessboard/052_branch_website_governance_and_scope_settings.sql` | Org columns + governance table + scope settings table + governance backfill |

### What 052 does **not** do

- Does not copy `public_pages` / entities into branches.
- Does not invent field overrides (`website_scope_settings` stays empty).
- Does not activate trusted publish or local giving.
- Does not change `branch_key` or public path shapes.

## Forward apply

```bash
npm run db:identity:check   # expect blessboard-platform-v5
DATABASE_URL=… npm run db:migrate
```

Verify:

```sql
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'blessboard'
   AND table_name = 'website_approval_settings'
   AND column_name IN ('allow_branch_giving_methods', 'allow_branch_urgent_updates');

SELECT to_regclass('blessboard.branch_website_governance');
SELECT to_regclass('blessboard.website_scope_settings');

SELECT
  (SELECT COUNT(*) FROM blessboard.branches) AS branches,
  (SELECT COUNT(*) FROM blessboard.branch_website_governance) AS governance_rows,
  (SELECT COUNT(*) FROM blessboard.website_scope_settings WHERE is_active) AS active_overrides;
-- Expect: governance_rows = branches, active_overrides = 0
```

## Backfill report (expected)

| Metric | Expected |
|--------|----------|
| `branch_website_governance` rows | One per existing branch (defaults) |
| Active `website_scope_settings` | **0** (inherit until override) |
| Church-wide `public_pages` (`branch_id IS NULL`) | Unchanged |
| Branch override pages | Unchanged |

## Rollback / compensating action

**Preferred:** Redeploy prior app; leave 052 tables in place (nullable/additive; unused by old readers).

**Schema reverse (only if required):**

```sql
BEGIN;
DROP TABLE IF EXISTS blessboard.website_scope_settings;
DROP TABLE IF EXISTS blessboard.branch_website_governance;
ALTER TABLE blessboard.website_approval_settings
  DROP COLUMN IF EXISTS allow_branch_giving_methods,
  DROP COLUMN IF EXISTS allow_branch_urgent_updates;
COMMIT;
```

Then delete ledger row for module `blessboard` version `052` only if your migrator requires it (prefer forward-fix over rewriting history).

## Tests

```bash
node --test tests/blessboard-prompt7-stage1-website-governance.test.js
node --test tests/blessboard-branch-mini-websites.test.js \
  tests/blessboard-branch-mini-website-shell.test.js \
  tests/blessboard-branch-mini-website-pages.test.js
```

## Stage boundary

Stage 1 stops here. **Do not** start Stage 2 (identity/contact/SEO value resolution into public chrome) until Stage 1 is reviewed.
