# Field Agents analytics — developer runbook

Internal reference for the **Admin Console → Field Agents analytics** subsystem: routes, data semantics, SQL paths, guardrails, observability, and safe change practices.  
Authoritative implementation: `src/routes/admin/adminFieldAgentAnalytics.js`, `src/db/pg/fieldAgentAnalyticsRepo.js`, `src/lib/fieldAgentAnalyticsObservability.js`.

---

## 1. Overview

### What this subsystem covers

- **Read-only analytics** over tenant-scoped field-agent data: submissions (`field_agent_provider_submissions`), callback leads (`field_agent_callback_leads`), joined to `field_agents` where needed.
- **Interactive drill-downs**: clickable dashboard KPI cards open FIFO-ordered, filterable, paginated lists; row click opens read-only detail panels.
- **Operational tooling**: CSV export (same filter semantics as lists), saved filter presets, a reporting center that delegates exports, bulk moderation actions on submission lists, and an admin **health** page summarizing guardrails and in-process performance signals.

### Problems it solves

- Gives admins a single place to inspect volumes, trends, and queues without ad-hoc SQL.
- Keeps **tenant isolation** and **CRM role gates** consistent across dashboard, lists, exports, and bulk actions.

### Main capabilities (admin-facing)

| Area | Behavior |
|------|----------|
| Dashboard | Aggregates, per-agent breakdown, daily trends; optional date/agent filters on the main page query string. |
| Drill-down lists | Server-rendered HTML fragments; FIFO ordering; filters; pagination. |
| Detail panels | Server-rendered fragments; no editing in-panel. |
| CSV | Full filtered dataset up to a **row cap** (not paginated like the UI). |
| Bulk actions | Submissions only; same transition rules as single-item flows; per-item results. |
| Presets | Per admin user, per tenant, per `record_type`; JSON filter payload is sanitized server-side. |
| Health | In-memory counters since process start; no PII; complements logs, does not replace external APM. |

---

## 2. Route map

All paths assume the admin router is mounted so URLs are prefixed with **`/admin`**. Permission columns: **CRM read** = `canAccessCrm`; **CRM mutate** = `canMutateCrm` (see `src/auth/roles.js`).

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/field-agent-analytics` | CRM read | Main analytics dashboard (EJS). |
| GET | `/field-agent-analytics/health` | CRM read | Health / guardrails / signal summary (EJS). |
| GET | `/field-agent-analytics/drilldown/submissions` | CRM read | Submissions drill-down list fragment (EJS). |
| GET | `/field-agent-analytics/drilldown/callback-leads` | CRM read | Callback leads drill-down list fragment (EJS). |
| GET | `/field-agent-analytics/drilldown/submissions/:id/panel` | CRM read | Submission detail fragment (EJS). |
| GET | `/field-agent-analytics/drilldown/callback-leads/:id/panel` | CRM read | Callback lead detail fragment (EJS). |
| POST | `/field-agent-analytics/drilldown/submissions/bulk-action` | CRM mutate | Bulk approve / reject / info needed / appeal (JSON). |
| GET | `/field-agent-analytics/drilldown/submissions/export.csv` | CRM read | Submissions CSV download. |
| GET | `/field-agent-analytics/drilldown/callback-leads/export.csv` | CRM read | Callback leads CSV download. |
| GET | `/field-agent-analytics/reporting` | CRM read | Reporting center form (EJS). |
| GET | `/field-agent-analytics/reporting/export` | CRM read | **302 redirect** to the appropriate `export.csv` with the same query parameters. |
| GET | `/field-agent-analytics/presets` | CRM read | JSON list of presets (`record_type` query required). |
| POST | `/field-agent-analytics/presets` | CRM read | Create preset (JSON body). |
| POST | `/field-agent-analytics/presets/:id` | CRM read | Rename preset (JSON body). |
| POST | `/field-agent-analytics/presets/:id/delete` | CRM read | Delete preset. |

### Middleware and instrumentation

- `router.use("/field-agent-analytics", faAnalyticsObs.endpointMiddleware())` wraps matching routes for slow-endpoint timing.
- `router.use("/field-agent-analytics", faAnalyticsObs.errorMiddleware())` runs **after** route registration to log handler errors for those paths.

Implementation file: `src/routes/admin/adminFieldAgentAnalytics.js`.

---

## 3. Dataset semantics

### Tenant scoping

- **`getAdminTenantId(req)`** supplies the tenant for every query and render. There is no cross-tenant drill-down, export, or preset access.
- Repositories consistently filter with `tenant_id = $1` (or equivalent join constraints) on submission/callback rows.

### FIFO ordering (drill-down lists and CSV)

- Lists and exports use **`ORDER BY created_at ASC, id ASC`** for both submissions and callback leads (`fieldAgentAnalyticsRepo`).
- Pagination uses **OFFSET/LIMIT** on that ordering; page is clamped to valid range after total count is known.

### Record-backed vs KPI-mapped drill-downs

- **Status buckets** (`pending`, `info_needed`, etc.) restrict rows by `field_agent_provider_submissions.status` (sometimes combined with optional `status` query override — see §4).
- **Financial dashboard cards** (“Total commission”, “Avg commission”) are **aggregates** on the dashboard; their drill-down buckets **`total_commission_approved`** and **`avg_commission_approved`** both map to the **approved submissions** row set (same underlying filter), with titles clarifying the KPI source.
- **Ratio-style KPIs on the dashboard** (e.g. approval rate) are computed in the dashboard handler; corresponding buckets **`approval_rate_decided`** and **`share_approved_all`** map to **specific submission subsets** (decided-only vs approved-only), not to a stored “rate” entity. Drill-down rows are always concrete records.

---

## 4. Buckets and definitions

Bucket strings are validated against `SUBMISSION_BUCKETS` or the callback rule (`callback_leads` only). Invalid buckets → **400** on drill-down/export.

| Bucket | `map.status` | `map.decidedOnly` | Drill-down row set (before optional filters) |
|--------|--------------|-------------------|-----------------------------------------------|
| `total_submissions` | `null` | no | All submissions for tenant (subject to filters). |
| `pending` | `pending` | no | `status = pending`. |
| `info_needed` | `info_needed` | no | `status = info_needed`. |
| `approved` | `approved` | no | `status = approved`. |
| `rejected` | `rejected` | no | `status = rejected`. |
| `appealed` | `appealed` | no | `status = appealed`. |
| `total_commission_approved` | `approved` | no | Same rows as **`approved`**; label ties to Total commission KPI. |
| `avg_commission_approved` | `approved` | no | Same rows as **`approved`**; label ties to Avg commission KPI. |
| `approval_rate_decided` | `null` | **yes** | `status IN ('approved','rejected')` when no explicit `status` filter; implements “decided” slice for the Approval rate (decided) KPI. |
| `share_approved_all` | `approved` | no | `status = approved`; label references Share approved KPI (still a plain approved list). |
| `callback_leads` | (n/a) | (n/a) | All callback leads for tenant (only valid bucket for callback drill-down). |

### Effective status and `decidedOnly` (submissions)

For each request:

- `effectiveStatus = filters.status || map.status` (optional query `status` overrides the bucket’s default status when both apply).
- `decidedOnly = !effectiveStatus && Boolean(map.decidedOnly)`.

So for **`approval_rate_decided`**, if the user sets `status` in the query string, the **`decidedOnly` window is disabled** and the list follows the explicit status only. This is intentional flexibility for filtering; document behavior when changing buckets.

---

## 5. Query paths

### Dashboard aggregates

| Data | Repo function | Notes |
|------|---------------|--------|
| Summary counts + commission | `getSubmissionSummaryForTenant` | Date/agent filters; not FIFO. |
| Per-agent breakdown | `getPerAgentBreakdown` | Includes derived rates per agent row. |
| Daily trends | `getSubmissionsPerDay`, `getCallbackLeadsPerDay` | Rolling window by days. |
| Agent dropdown | `listFieldAgentsForTenant` | Ordered by `lower(username)`. |

### Drill-down lists

| Flow | Repo | Filters | Order | Pagination |
|------|------|---------|-------|------------|
| Submissions | `countSubmissionDrilldownRows` + `listSubmissionDrilldownRows` | `from`, `to`, `fieldAgentId`, `status` / `decidedOnly`, `q` | FIFO | `page`, `page_size` → offset/limit; count for totals. |
| Callback leads | `countCallbackLeadDrilldownRows` + `listCallbackLeadDrilldownRows` | `from`, `to`, `fieldAgentId`, `q` | FIFO | Same pattern. |

### Detail panels

| Type | Repo | Scoping |
|------|------|---------|
| Submission | `getSubmissionDrilldownDetailById` | `tenant_id` + `id`; 404 if missing. |
| Callback lead | `getCallbackLeadDrilldownDetailById` | Same pattern. |

### CSV export

- Uses the **same filter and bucket semantics** as the list (`parseAnalyticsFilters` + bucket map).
- Fetches up to **`EXPORT_MAX_ROWS`** rows in one query (not UI page size).
- Rejects with **413** if `count*` exceeds `EXPORT_MAX_ROWS` (see §8).

### Reporting center

- **`GET /field-agent-analytics/reporting/export`** builds query params and **redirects** to `.../submissions/export.csv` or `.../callback-leads/export.csv`. No duplicate query logic.

### Bulk actions

- **`fieldAgentSubmissionsRepo.applyBulkSubmissionAction`**: validates IDs against tenant, enforces `maxIds`, applies per-item transitions (same rules as single-item moderation).
- Route passes `maxIds: BULK_MAX_IDS` from env-backed constant.

### Presets

- Storage: `admin_field_agent_analytics_presets` (`db/postgres/027_field_agent_analytics_presets.sql`).
- Repo: `src/db/pg/adminFieldAgentAnalyticsPresetsRepo.js`.

---

## 6. Search and filter notes

### Query parameters (drill-down / export / reporting)

| Param | Usage |
|-------|--------|
| `bucket` | Required for submissions (`SUBMISSION_BUCKETS`); callback leads require `callback_leads`. |
| `q` | Free text; optional. |
| `status` | Submissions only; must be one of `SUBMISSION_STATUSES` or omitted. Overrides bucket default when present. |
| `from` / `to` | Inclusive-ish range via `normalizeDateRange` (UTC day start / end — see repo). |
| `agent` | Positive integer → `field_agent_id` filter. |
| `page` / `page_size` | List UI only; clamped (see §8). |

### ILIKE behavior

- **Submissions**: `q` matches concatenated name, `phone_raw`, `whatsapp_raw`, `profession`, `city`, `pacra` (OR group).
- **Callback leads**: name, `phone`, `email`, `location_city`.

### Limitations (by design)

- No PostgreSQL full-text or trigram indexes in this subsystem; **prefix/wildcard ILIKE** can be expensive on large tenants.
- Search does not log raw user strings in observability summaries (`summarizeFilters` only records booleans and non-PII metadata).

---

## 7. Indexes and performance notes

Migration: `db/postgres/026_field_agent_analytics_drilldown_indexes.sql`.

| Index | Table | Columns | Intended use |
|-------|-------|---------|--------------|
| `idx_faps_tenant_created_id` | `field_agent_provider_submissions` | `(tenant_id, created_at, id)` | Tenant-scoped FIFO scans and pagination. |
| `idx_faps_tenant_status_created_id` | same | `(tenant_id, status, created_at, id)` | Status/bucket filters + FIFO. |
| `idx_faps_tenant_agent_created_id` | same | `(tenant_id, field_agent_id, created_at, id)` | Agent filter + FIFO. |
| `idx_facl_tenant_created_id` | `field_agent_callback_leads` | `(tenant_id, created_at, id)` | FIFO for leads. |
| `idx_facl_tenant_agent_created_id` | same | `(tenant_id, field_agent_id, created_at, id)` | Agent filter + FIFO. |

**Deferred / not assumed**

- ILIKE across multiple columns may still drive sequential scans or partial index use; improving that would mean product-approved search changes (e.g. trigram), not silent tweaks here.
- Dashboard aggregate queries and trends are separate from drill-down FIFO paths; optimize only with profiling evidence.

---

## 8. Guardrails

Constants and env overrides are defined in `adminFieldAgentAnalytics.js` (unless noted).

| Guardrail | Server behavior | Client UX (typical) |
|-----------|-----------------|---------------------|
| **Page size** | `DEFAULT_PAGE_SIZE = 50`, `MAX_PAGE_SIZE = 100`; invalid values clamped. | Selector capped in drill-down UI. |
| **Export row cap** | `EXPORT_MAX_ROWS = max(env FA_ANALYTICS_EXPORT_MAX_ROWS, 1)` default **5000**. Count first; if `totalResults > cap`, **413** with plain-text message. | `exportGuard.too_large` disables export link when count exceeds cap. |
| **Bulk ID cap** | `BULK_MAX_IDS` from **FA_ANALYTICS_BULK_MAX_IDS** default **200**. Repo rejects with structured error; route may return **413**. | Toolbar messaging for max selectable IDs. |

**Evidence**: caps are tied to load-testing and operational safety work in this feature area; tune via env in deployment without code changes when possible.

---

## 9. Observability

Module: `src/lib/fieldAgentAnalyticsObservability.js`.

| Signal | Behavior |
|--------|----------|
| **Slow query** | Duration &gt; `FA_ANALYTICS_SLOW_QUERY_MS` (default **200**). Logs structured payload with **query label** (not raw SQL), tenant id, endpoint context, optional row count, summarized filters. Increments `slowQueries`. |
| **Slow endpoint** | Response time &gt; `FA_ANALYTICS_SLOW_ENDPOINT_MS` (default **500**) on `res.finish`. Increments `slowEndpoints`. |
| **Query error** | Caught in `observeQuery`; logs truncated message; increments `queryErrors`. |
| **Endpoint error** | Error middleware logs; increments `endpointErrors`. |
| **Per-endpoint request counts** | In-memory map keyed by `METHOD baseUrl+path`. |

### Health page

- **`GET /field-agent-analytics/health`** reads `getCounters()` and `getConfig()`, classifies **Healthy / Degraded / Unknown** from cumulative signal counts since process start, and renders guardrail numbers. **Not** real-time cluster health; **not** durable metrics.

### Privacy / safety

- Do not log `q`, phone numbers, names, or raw SQL with parameters.
- Filters in logs are **flags** (e.g. `has_search`), not content.

---

## 10. Troubleshooting guide

| Symptom | Likely causes | Inspect first |
|---------|----------------|---------------|
| Drill-down list slow | Large tenant + `q` ILIKE; heavy offset on huge sets; missing indexes (migration not applied). | DB: `EXPLAIN ANALYZE` on `list*DrilldownRows` with same filters. Logs: `[FA_ANALYTICS] slow_query`. Migration **026** applied? |
| Export rejected (**413**) | Row count over `EXPORT_MAX_ROWS`. | Same filters as UI; check `count*` path. Narrow date/agent/`q`. |
| Unexpected empty list | Wrong `bucket`; filters too strict; `status` override vs bucket semantics; date range excludes data. | Request query string; `SUBMISSION_BUCKETS` + `effectiveStatus` / `decidedOnly` logic in route. |
| “Wrong” bucket vs KPI | KPI label maps multiple cards to same status set (e.g. commission cards → approved). | §4 table; dashboard copy vs `bucket` param. |
| 403 / redirect to login | CRM role missing; session missing. | `requireCrmAccess` / `requireCrmMutate`; `canAccessCrm` / `canMutateCrm`. |
| 404 on detail | Wrong id; other tenant’s id; typo in URL. | Repo `get*DetailById` WHERE tenant. |
| Bulk partial failures | Invalid transitions per row (expected). | JSON `results[]` per id; compare to `fieldAgentSubmissionsRepo` transition rules. |
| Bulk rejected with “Too many ids” | Over `BULK_MAX_IDS`. | Reduce selection or raise env cap with ops approval. |
| Health shows **Degraded** | High slow/error counts since deploy/restart. | Logs for `slow_query` / `slow_endpoint`; underlying DB load; not necessarily user-visible outage. |
| Preset “invalid bucket” | Mismatch `record_type` vs bucket. | `allowedBucketForRecordType`; reporting `parseReportingSelection`. |

---

## 11. Known caveats and deferred work

Accurate as of this subsystem’s scope (not an exhaustive product roadmap):

- **No** XLSX/PDF; **no** background export jobs or email delivery.
- **No** external APM (Datadog, OpenTelemetry) inside this module; logs + in-memory counters only.
- **No** trigram/GIN full-text for `q` unless a future change is explicitly approved and migrated.
- **No** cross-feature admin performance work bundled here.
- **No** charts on the health page; classification is threshold-based on counters.
- **Callback leads**: no bulk moderation in this UI (submissions only).
- **Presets**: per-user, not shared team presets.
- **Reporting center**: redirect-based export — behavior must stay aligned with drill-down CSV semantics.

---

## 12. Safe change guidance

### Adding a new submission bucket

1. Add an entry to **`SUBMISSION_BUCKETS`** with explicit `status` and/or `decidedOnly`.
2. Add the same bucket to **`reportingDatasets()`** if it should appear in the reporting center.
3. Update **`allowedBucketForRecordType`** only if new record types are introduced (rare).
4. Update this runbook’s bucket table.

### Preserving FIFO

- Any new list or export query for drill-downs must keep **`ORDER BY created_at ASC, id ASC`** (or documented exception with product sign-off).

### Preserving tenant scoping

- Every new query must include the tenant predicate (or join that implies it). Never accept `tenant_id` from the client body for presets or filters.

### Adding a new export column

- Update **both** the CSV row builder and the header array in the export route; keep columns aligned with schema fields already selected in repo or route.

### When to add indexes

- Add or adjust indexes only when a **specific** slow path is confirmed (e.g. new mandatory filter column used in WHERE + ORDER BY). Avoid speculative indexes for ILIKE.

### When semantics change

- Update **`docs/field-agent-analytics-runbook.md`**, **`SUBMISSION_BUCKETS` comments**, and any user-visible labels in EJS that describe mappings.

---

## Quick file index

| File | Role |
|------|------|
| `src/routes/admin/adminFieldAgentAnalytics.js` | Routes, buckets, CSV, guardrails, health, reporting redirect. |
| `src/db/pg/fieldAgentAnalyticsRepo.js` | Drill-down list/count/detail SQL; dashboard helpers. |
| `src/db/pg/fieldAgentSubmissionsRepo.js` | Bulk submission actions. |
| `src/db/pg/adminFieldAgentAnalyticsPresetsRepo.js` | Presets CRUD. |
| `src/lib/fieldAgentAnalyticsObservability.js` | Timing, counters, logging. |
| `views/admin/field_agent_analytics*.ejs` | Dashboard, drill-down list, detail panels, reporting, health. |
| `public/admin-field-agent-analytics.js` | Modal, filters, pagination, bulk, presets (bundled via Vite entry). |
| `db/postgres/026_*` / `027_*` | Indexes + presets table. |
