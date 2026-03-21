# GetPro data model (multi-tenant)

## Tenants (regions)

Rows live in **`tenants`** (`id`, `slug`, `name`, `stage`, …). Default seed IDs:

| id | slug | name |
|----|------|------|
| 1 | zm | Zambia |
| 2 | il | Israel |
| 3 | bw | Botswana |
| 4 | zw | Zimbabwe |
| 5 | za | South Africa |
| 6 | na | Namibia |
| (auto) | global | Global |

The **`global`** tenant is created at boot if missing. It is used as the **apex** home (`getproapp.org` / `www`) when its stage is **`Enabled`**. It does **not** appear in the public region picker (only regional subdomains do).

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
