# GetPro data model (multi-tenant)

## Tenants (regions)

Rows live in **`tenants`** (`id`, `slug`, `name`, `stage`, …). Canonical seed IDs (see `src/tenants/tenantIds.js`):

| id | slug | name |
|----|------|------|
| 1 | global | Global |
| 2 | demo | Demo |
| 3 | il | Israel |
| 4 | zm | Zambia |
| 5 | zw | Zimbabwe |
| 6 | bw | Botswana |
| 7 | za | South Africa |
| 8 | na | Namibia |

Existing databases created with the old id layout are **remapped once** on boot (`tenant_id_layout_v1` in `_getpro_migrations`). Rows whose `slug` is **not** in the canonical list (`global`, `demo`, `il`, `zm`, `zw`, `bw`, `za`, `na`) are **removed once** with their scoped data (`delete_non_canonical_tenants_v1`). After that, **Super admin** can **create, edit, or delete** additional regions from **`/admin/super`** (except **global**); new regions get categories copied from **Zambia** (`zm`) on create.

The **`global`** tenant is used as the **apex** home (`getproapp.org` / `www`) when its stage is **`Enabled`**. It does **not** appear in the public region picker (only regional subdomains do). **`demo`** is **`Enabled`** by default for **`demo.{BASE_DOMAIN}`** but is **not** listed in the region picker (direct URL / staging). **`za`** (South Africa) defaults to **`Disabled`**; enable from **Super admin** when launching that region.

On **first database boot**, a migration may set all tenants except **`global`** and **`zm`** to **`Disabled`** (see `GETPRO_SKIP_TENANT_REGION_LOCK` in the README). A separate one-time migration then **enables `demo`** and **disables `za`**. Re-enable other regions from **Super admin** if needed.

**Stage** (`PartnerCollection`, `Enabled`, `Disabled`) controls public visibility: **`Enabled`** tenants receive traffic on `{slug}.{BASE_DOMAIN}` when not otherwise excluded. The region picker lists **`Enabled`** tenants except **`global`** (apex-only) and **`demo`** (hidden from the list).

### Super admin and `tenant_id` in the admin UI

Professions, companies, cities, leads, and tenant-scoped users in **`/admin/...`** are loaded for **one** tenant at a time: the session’s **tenant scope** (`adminTenantScope`). **`super_admin`** defaults to **`demo`** when it is `Enabled`, then **`global`**, then **`zm`** on login (see `GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG` in the README). If no scope is stored in the session, directory tools (**Professions**, **Companies**, **Cities**) still resolve to **Zambia (`zm`)** so lists are never empty solely due to missing scope. Use **`/admin/super`** → *Act as region* to pin another tenant. Scoping to **`global`** shows that tenant’s rows only (often fewer companies than regional tenants).

## Tables scoped by `tenant_id`

These tables hold **one row set per tenant** (filter with `WHERE tenant_id = ?`):

- **`categories`** — directory categories per region; each row has **`tenant_id`**. Slug is unique **per tenant** (`UNIQUE(tenant_id, slug)`), so the same slug (e.g. `electricians`) can exist independently for Zambia vs Demo with different `id`s. **Public** directory and category pages query `WHERE tenant_id = ?` for the current host’s tenant. **Admin** lists and mutates categories only for **`getAdminTenantId(req)`** (the scoped region for super admins, or the logged-in user’s tenant for `tenant_manager` / `tenant_editor`). **Who can add/edit/delete:** `super_admin`, `tenant_manager`, and `tenant_editor` (`requireDirectoryEditor` + `requireNotViewer` on POST); **`tenant_viewer`** is read-only.  
- **`companies`** — listings (and company marketing subdomains). Optional **directory profile** fields: `years_experience`, `service_areas`, `hours_text`, `gallery_json` (JSON array of `{ url, caption }` for “Recent work” on `/company/:id`).  
- **`leads`** — contact requests (also tied to `company_id`)  
- **`professional_signups`** — join / interest signups  
- **`callback_interests`** — callback requests (e.g. Join **Call me**), with `interest_label` (e.g. `Potential Partner`)  
- **`tenant_cities`** — per-region city names for Join autocomplete; `enabled` (normal sign-up vs waitlist popup), `big_city` (rotating watermark hints on Join step 2 when also enabled)  
- **`admin_users`** — admin accounts; `tenant_id` is **NULL** only for `super_admin`. Optional **`display_name`** for UI. Effective per-region roles for users attached to multiple tenants live in **`admin_user_tenant_roles`** (`admin_user_id`, `tenant_id`, `role`, primary key on `(admin_user_id, tenant_id)`).

## Reviews

**`reviews`** rows belong to a **`companies`** row (`company_id`, `ON DELETE CASCADE`). Fields include **`rating`** (1–5), **`body`**, **`author_name`**, **`created_at`**.

- **Directory cards** compute **all-time** `ROUND(AVG(rating), 2)` and **`COUNT(*)`** per company.
- The **highlight** line is the **single highest-rated** review in the **last 90 days** (tie-break: most recent `created_at`). Label on the UI: “Top review · last 3 months”.

Demo tenant sample reviews are seeded once (`reviews_seed_demo_v1` in `_getpro_migrations`). If an **Enabled** tenant has **no** `categories` rows, a one-time migration copies professions from **Zambia** (`repair_empty_categories_enabled_tenants_v1`).

**`ensure_canonical_categories_all_tenants_v1`** (once): if **Zambia** has no professions, inserts a canonical list of slugs (electricians, plumbers, …), then runs `seedCategoriesForTenant` for tenants `1,2,3,5,6,7,8` so global, demo, and regional tenants that are still empty receive a copy from Zambia.

## Global / shared tables

- **`tenants`** — region definitions and lifecycle stage  
- **`sessions`** (if using SQLite session store) — separate file under `data/sessions.db` by default  

There is **not** a separate physical database per tenant: isolation is by **`tenant_id`** columns in SQLite.
