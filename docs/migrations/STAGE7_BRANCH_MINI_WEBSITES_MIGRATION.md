# Stage 7 — Branch mini websites data migration & rollback

**Scope:** BlessBoard V5 branch mini websites (Stages 1–6).  
**Policy:** Additive only. No destructive data rewrite. Do not copy church-wide CMS into every branch.

## Goals (existing data)

1. Keep church-wide website rows at `branch_id = NULL`.
2. Preserve existing `/c/:organizationKey` (and tenant-host `/`) church-wide URLs.
3. Generate branch mini-site URLs from existing stable `branches.branch_key`.
4. Keep primary-branch identity on `branches.is_primary` / HQ role assignment; do not reassign content.
5. Public branch pages inherit church-wide content until a branch override exists.
6. Do **not** bulk-copy church-wide pages/sections/entities into every branch.
7. Do **not** DROP, TRUNCATE, or DELETE church-wide content as part of cutover.

## Migrations to apply

| Order | File | Effect |
|------:|------|--------|
| Existing | `010_create_public_pages.sql` (+ related CMS) | Already supports nullable `branch_id` on pages/entities |
| Existing | Stages 1–5 code paths | Scope resolver, public routes, inheritance, editors |
| **Required for Stage 6** | `051_website_publication_versions_branch_scope.sql` | Adds nullable `branch_id` on `website_publication_versions`; replaces org-wide single-published unique index with church-wide + per-branch unique indexes; extends scope trigger |

### What 051 does **not** do

- Does not rewrite existing version rows (they remain `branch_id NULL` = church-wide).
- Does not create branch page copies.
- Does not change `organization_key`, `branch_key`, or public path shapes for church-wide sites.

## Forward apply

```bash
# Identity check first (environment-specific)
npm run db:identity:check

# Apply pending blessboard migrations (includes 051)
npm run db:migrate   # or project-equivalent migrator command
```

Verify:

```sql
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'blessboard'
   AND table_name = 'website_publication_versions'
   AND column_name = 'branch_id';

SELECT indexname
  FROM pg_indexes
 WHERE schemaname = 'blessboard'
   AND tablename = 'website_publication_versions'
   AND indexname IN (
     'wpv_one_published_church_wide',
     'wpv_one_published_per_branch'
   );

-- Church-wide pages must remain NULL-scoped
SELECT COUNT(*) AS church_wide_pages
  FROM blessboard.public_pages
 WHERE branch_id IS NULL;

SELECT COUNT(*) AS branch_override_pages
  FROM blessboard.public_pages
 WHERE branch_id IS NOT NULL;
```

## Runtime inheritance (no data copy)

Public loaders resolve:

- Explicit branch URL → content for that `branch_id`, falling back to church-wide (`NULL`) per page/entity rules.
- Church-wide URL → `branch_id IS NULL` only (plus primary branch for contact/settings where product already does).

Branch overrides are created only when HQ/BA edit that branch page (Stage 5). Empty provisioned drafts do not replace church-wide public content.

## Rollback

### App rollback (preferred)

1. Redeploy previous app release that does not require branch-scoped version APIs.
2. Leave `branch_id` column in place (nullable; safe for old readers that omit it).
3. Clear CDN/static cache for `tenant-public.css` / JS if version querystrings changed.

### Schema rollback for 051 (only if required)

**Caution:** Dropping unique indexes while multiple `published` rows exist per org (church-wide + branches) will fail if you recreate `wpv_one_published_per_org` without first superseding branch published rows.

Safe order if you must reverse 051:

```sql
BEGIN;

-- 1) Optional: supersede branch-scoped published versions so at most one published remains per org
UPDATE blessboard.website_publication_versions
   SET status = 'superseded', superseded_at = now()
 WHERE status = 'published' AND branch_id IS NOT NULL;

-- 2) Drop scope-aware indexes
DROP INDEX IF EXISTS blessboard.wpv_one_published_per_branch;
DROP INDEX IF EXISTS blessboard.wpv_one_published_church_wide;
DROP INDEX IF EXISTS blessboard.wpv_org_branch_idx;

-- 3) Restore legacy one-published-per-org index
CREATE UNIQUE INDEX IF NOT EXISTS wpv_one_published_per_org
  ON blessboard.website_publication_versions (organization_id)
  WHERE status = 'published';

-- 4) Restore prior trigger function without branch check (from 041), then:
-- ALTER TABLE ... DROP COLUMN branch_id;  -- only if no dependency remains

COMMIT;
```

Prefer **not** dropping `branch_id` if any branch versions were published in production.

## Post-migration smoke

1. `/c/:organizationKey` still 200 for published church.
2. `/c/:organizationKey/branches/:branchKey` 200 for active branch; unknown key 404.
3. HQ church-wide publish does not change other branch page rows.
4. Branch publish does not flip another branch or church-wide pages.
5. Cross-org version restore remains 404.
