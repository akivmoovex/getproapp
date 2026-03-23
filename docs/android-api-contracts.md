# Android API contracts (GetPro)

Practical contracts for the native app, grounded in the **current Node backend** (`src/routes/api.js`, `src/routes/public.js`) and the product notes in `docs/android-material3-spec.md`.

**Status today**

| Capability | Web today | JSON API today |
|------------|-----------|----------------|
| Directory search | `GET /directory` (SSR + SQL) | **No** stable public JSON |
| Categories list | Loaded in SSR per tenant | **No** dedicated JSON |
| Company profile | `GET /company/:id` (SSR) | **No** stable public JSON |
| Lead from profile | Form → `POST /api/leads` | **Yes** |
| Callback / empty state | `POST /api/callback-interest` | **Yes** |
| Join / onboarding | `POST /api/professional-signups` | **Yes** |

Read paths for search/profile/categories are **proposed** as versioned endpoints so Android can consume JSON without scraping HTML. Align backend implementation with these shapes when you add them.

---

## Part 1 — Flow → backend → Android

| Flow | Existing backend source | Android dependency | Notes |
|------|---------------------------|--------------------|--------|
| Search professionals | `GET /directory?q=&city=&category=` (SSR); logic in `public.js` | `SearchRepository` → future `GET /api/v1/directory` | Query semantics should match web: tenant-scoped, category slug optional. |
| Load categories | DB `categories` per `tenant_id` in SSR | `CategoryRepository` → future `GET /api/v1/categories` | Same ordering as web (`sort`, `name`). |
| Professional profile | `GET /company/:id` (SSR) | `ProfessionalRepository` → future `GET /api/v1/companies/:id` | Support numeric `id`; slug variant optional if backend adds it. |
| Request contact (lead) | `POST /api/leads` | Future `LeadRepository` or extend profile flow | Body: `company_id`, `name`, `phone`, `email`, `message`. Not wired in current Compose template MVP. |
| Callback interest | `POST /api/callback-interest` | `CallbackRepository` | **Implemented** server-side; requires `tenantId` or `tenantSlug`. |
| Business onboarding | `POST /api/professional-signups` | `BusinessOnboardingRepository` | **Implemented**; fields: `profession`, `city`, `name` (business name), `phone`, `vat_or_pacra`, tenant fields. |
| Articles | `GET /articles`, `/articles/:slug` (SSR) | Optional content screens | JSON TBD or WebView fallback. |
| Q&A / guides | `GET /answers*`, `/guides*` (SSR) | Optional | Same. |

---

## Part 2 — Implemented POST contracts (match production)

### 2.1 `POST /api/callback-interest`

| | |
|--|--|
| **Method** | POST |
| **Content-Type** | `application/json` |
| **Auth** | Public; tenant resolved from body (not from host alone). |

**Request body** (see `resolveTenantIdStrict` in `api.js`):

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `tenantId` | number | One of `tenantId` **or** `tenantSlug` | Must exist in DB; if both present, slug must match id. |
| `tenantSlug` | string | One of above | e.g. `zm` |
| `name` | string | Recommended | max ~120 |
| `phone` | string | Recommended | max 40; Zambia validated when tenant is `zm` |
| `context` | string | No | max ~120; default server behavior uses `join_exit` if empty |
| `interest_label` or `label` | string | No | max ~120 |
| `cityName` | string | No | triggers waitlist-style label if set |

**Success:** `200` — `{ "ok": true }`

**Errors:** `400` / `403` — `{ "error": "string" }` (e.g. invalid tenant, invalid phone, Israel gate).

---

### 2.2 `POST /api/professional-signups`

| | |
|--|--|
| **Method** | POST |
| **Content-Type** | `application/json` |

**Request body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `tenantId` | number | Yes (or slug path) | Same resolution rules as callback. |
| `tenantSlug` | string | With or instead of id | Must match when both sent. |
| `profession` | string | Yes | |
| `city` | string | Yes | |
| `name` | string | Yes | **Business name** (maps from Android `businessName`). |
| `phone` | string | Yes | Region-specific validation for `zm`. |
| `vat_or_pacra` | string | No | max ~200; web often sends `""`. |

**Optional future:** `email` — **not** in current API; add only if backend extends `professional_signups`.

**Success:** `200` — `{ "ok": true }`

**Errors:** `400` / `403` — `{ "error": "string" }`

---

### 2.3 `POST /api/leads`

| | |
|--|--|
| **Method** | POST |
| **Content-Type** | `application/json` |

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `company_id` | number | Yes |
| `name` | string | No (max 120) |
| `phone` | string | No (max 30) |
| `email` | string | No (max 120) |
| `message` | string | No (max 2000) |

**Success:** `200` — `{ "ok": true }`

**Errors:** `400` / `404` / `403` — `{ "error": "string" }`

---

## Part 3 — Proposed read contracts (backend to implement)

Use a single API base (e.g. `https://{tenantHost}` or `BuildConfig.API_BASE_URL`) and **tenant context** via host header or explicit header as agreed with backend.

### 3.1 `GET /api/v1/categories`

| | |
|--|--|
| **Auth** | Public |
| **Tenant** | Resolve like web SSR: **Host** / `X-Tenant-Slug` / `X-Tenant-Id` (product decision). |

**Response `200`:**

```json
{
  "categories": [
    {
      "id": "string-or-number",
      "name": "string",
      "slug": "string",
      "sort": 0
    }
  ]
}
```

Android maps → domain/`CategoryUiModel`.

---

### 3.2 `GET /api/v1/directory`

| | |
|--|--|
| **Auth** | Public |
| **Tenant** | Same as categories |

**Query parameters** (align with web `directory`):

| Param | Notes |
|-------|--------|
| `q` | Service / free-text (maps to Android “service”) |
| `city` | City filter |
| `category` | Category **slug** (optional) |
| `page`, `page_size` | Optional pagination |

**Response `200`:**

```json
{
  "items": [
    {
      "id": "string",
      "name": "string",
      "headline": "string|null",
      "category_name": "string|null",
      "city": "string|null",
      "rating": 4.8,
      "review_count": 12
    }
  ],
  "total": 100
}
```

Map to list card `ProfessionalUiModel` + optional rating label string in mapper.

---

### 3.3 `GET /api/v1/companies/:id`

`:id` — numeric company id (matches `/company/:id`).

**Response `200`:** full profile DTO (about, services, reviews, phone, WhatsApp, years in business, etc.).

**Response `404`:** `{ "error": "..." }`

Map → `ProfileUiModel` in the UI layer via a single mapper.

**Optional:** `GET /api/v1/companies/by-slug/:slug` if mini-site slugs must be supported without id.

---

### 3.4 Optional content APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/articles` | List for Article list screen |
| `GET /api/v1/articles/:slug` | Detail |
| `GET /api/v1/guides` … | Same pattern |
| `GET /api/v1/faq` … | Q&A screen |

Shape: `{ "items": [...] }` with stable `slug`, `title`, `excerpt`, `body` or `html_url`.

---

## Part 4 — Error envelope (all JSON endpoints)

**Standard error JSON:**

```json
{ "error": "Human-readable message" }
```

**HTTP status usage (typical):**

| Code | Meaning |
|------|---------|
| 400 | Validation / bad tenant / bad phone |
| 403 | Region gated (e.g. Israel coming soon) |
| 404 | Company not found |
| 429 | Rate limit (if added) |
| 5xx | Server error — show generic message + retry where appropriate |

Android repositories should map HTTP + body to a small sealed type or `Result` (see `android-repository-swap-plan.md`).

---

## Part 5 — Tenant / public context

- **Public endpoints:** Read directory/categories/profile (once added) are unauthenticated, same as SSR pages.
- **Writes** (`/api/leads`, `/api/callback-interest`, `/api/professional-signups`) do **not** rely on session; they require **explicit tenant identification** via `tenantId` + optional `tenantSlug` check, per `resolveTenantIdStrict`.
- **Android should:**
  - Ship **tenant id + slug** in `BuildConfig` (or remote config) per app flavor / store listing.
  - Send the same fields the web sends on join/callback so rows land under the correct tenant.
  - Optionally send **Host** or **`X-Tenant-Slug`** on GET requests if the backend uses host-based tenant resolution for JSON (match `req.tenant` middleware behavior).

Do not invent extra tenant headers without aligning with the Node `tenant` middleware.

---

## Part 6 — Versioning

- Prefix new read APIs with **`/api/v1/`** to leave room for evolution.
- POST endpoints remain at **`/api/*`** for backward compatibility with the web unless you version them deliberately.

---

*Update this file when `api.js` or new read routes ship.*
