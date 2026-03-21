# GetPro data model (multi-tenant)

## Tenants (regions)

Rows live in **`tenants`** (`id`, `slug`, `name`, `stage`, …). Canonical seed IDs (see `src/tenantIds.js`):

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

Existing databases created with the old id layout are **remapped once** on boot (`tenant_id_layout_v1` in `_getpro_migrations`).

The **`global`** tenant is used as the **apex** home (`getproapp.org` / `www`) when its stage is **`Enabled`**. It does **not** appear in the public region picker (only regional subdomains do). **`demo`** is seeded as **`Disabled`** by default (staging / internal).

On **first database boot**, a migration may set all tenants except **`global`** and **`zm`** to **`Disabled`** (see `GETPRO_SKIP_TENANT_REGION_LOCK` in the README). Re-enable regions from **Super admin** if needed.

**Stage** (`PartnerCollection`, `Enabled`, `Disabled`) controls public visibility: only **`Enabled`** tenants appear in the region picker and receive traffic on `{slug}.{BASE_DOMAIN}` (except `global`, which is apex-only).

## Tables scoped by `tenant_id`

These tables hold **one row set per tenant** (filter with `WHERE tenant_id = ?`):

- **`categories`** — directory categories per region  
- **`companies`** — listings (and company marketing subdomains)  
- **`leads`** — contact requests (also tied to `company_id`)  
- **`professional_signups`** — join / interest signups  
- **`callback_interests`** — callback requests (e.g. Join **Call me**), with `interest_label` (e.g. `Potential Partner`)  
- **`admin_users`** — admin accounts; `tenant_id` is **NULL** only for `super_admin`

## Global / shared tables

- **`tenants`** — region definitions and lifecycle stage  
- **`sessions`** (if using SQLite session store) — separate file under `data/sessions.db` by default  

There is **not** a separate physical database per tenant: isolation is by **`tenant_id`** columns in SQLite.
