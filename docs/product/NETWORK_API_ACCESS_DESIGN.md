# Network API access design (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / security design only — **do not implement public API endpoints**  
**Constraint:** Do not reuse browser sessions as API authentication · Do not store raw API secrets · Do not expose member private data by default  

**Companions:** [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) (B2 / N2) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`V5_AUTHORIZATION_MATRIX.md`](../security/V5_AUTHORIZATION_MATRIX.md) · [`V5_SESSION_COOKIE_AUDIT.md`](../security/V5_SESSION_COOKIE_AUDIT.md) · [`V5_DATA_RETENTION_PRIVACY_INVENTORY.md`](../security/V5_DATA_RETENTION_PRIVACY_INVENTORY.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md)

---

## Verdict

### **PRODUCT DECISION REQUIRED**

Technical default **if** Network API is retained as software: **Option A — read-only API keys** with narrow scopes and aggregate-first resources (below).  

Do **not** mark **READY TO IMPLEMENT READ-ONLY API** until product closes **N2** (self-serve vs assisted-only; whether a public `/v1` surface ships at all vs permanent “by arrangement” ops).  

| Conclude label | Selected |
|----------------|:--------:|
| READY TO IMPLEMENT READ-ONLY API | No — N2 unsigned; `api_access` remains **false** |
| **PRODUCT DECISION REQUIRED** | **Yes (primary)** |
| DEFER | Acceptable fallback if product keeps API as commercial promise only |

**Safest posture until N2:** keep runtime `FEATURE_KEYS.api_access = false`; keep HQ `/hq/integrations/api` locked/hidden; commercial language stays **by arrangement**.

---

## 1. Repository evidence

| Area | Finding |
|------|---------|
| Runtime entitlement | `api_access` / `webhooks` / `integrations` = **false** on all plans |
| Commercial catalogue | Network `integrations.public_api` / `reports.api` aspirational — not FEATURE_KEYS |
| V5 routes | No `/api/v1/*` or HQ API key admin; catalogue path `/hq/integrations/api` gated; V4 church tests assert webhook POST → **409** locked |
| Stitch | **No** dedicated API-key / developer-console Stitch pair in [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) |
| Browser auth | Host-only **HttpOnly** cookie; SHA-256 hash in `platform.deployment_sessions`; 12h TTL; transfer tokens separate ([session audit](../security/V5_SESSION_COOKIE_AUDIT.md)) |
| Tenant authz | UUID org/church/branch via `authorizeBlessBoardTenantAccess` + fixed roles ([authz matrix](../security/V5_AUTHORIZATION_MATRIX.md)) |
| Audit | Append-only `platform.audit_events` with metadata allowlist (no secrets/PII bodies) |
| Rate limiting | Exists for field-agent / public forms — **not** a BlessBoard tenant API gateway |
| Existing “API-shaped” surfaces | HTML/EJS HQ services (reports, members, etc.) — **not** versioned machine APIs |

---

## 2. Purpose (recommended)

Enable **trusted church/network IT systems** (and GetPro-assisted integrators) to **read** approved, church-scoped operational aggregates and catalogues — not to replace HQ HTML admin, not to power anonymous public apps, and not to dump member private data.

**Non-goals (v1):** write mutations, webhook delivery bus, OAuth user consent UI, mobile member apps using API keys, GraphQL, third-party marketplace.

---

## 3. Supported consumers (v1)

| Consumer | Allowed? |
|----------|----------|
| Church HQ / Network IT middleware (server-side) | Yes |
| GetPro-assisted integration jobs (ops) | Yes |
| Browser SPAs using API keys in JS | **No** |
| Members / public websites | **No** |
| Branch admin personal scripts with PATs | Prefer **no** (see option C) |

---

## 4. Options compared

### A. Read-only API keys (organization- or church-scoped)

| | |
|--|--|
| **Idea** | Long-lived credentials with hashed secret at rest; Bearer token; scopes allowlist; GET only |
| **Pros** | Matches session secret-handling pattern; simple; auditable; aligns with “by arrangement” activation |
| **Cons** | Key theft = persistent access until revoke; needs rotation UX |
| **Fit** | **Recommended technical default** after N2 |

### B. OAuth-style client credentials

| | |
|--|--|
| **Idea** | `client_id` + `client_secret` → short-lived access tokens |
| **Pros** | Better rotation hygiene; industry-familiar for M2M |
| **Cons** | Token endpoint, clock skew, more surface; no V5 OAuth stack today |
| **Fit** | Later phase if multiple clients / partners scale |

### C. Personal access tokens (user-bound)

| | |
|--|--|
| **Idea** | Token inherits a user’s HQ/branch roles |
| **Pros** | Familiar to developers |
| **Cons** | Privilege escalation / stale role risk; couples machine access to human accounts; harder SoD |
| **Fit** | **Reject for v1** |

### D. Defer external API

| | |
|--|--|
| **Idea** | No software surface; assisted exports / ops only |
| **Pros** | Matches current FEATURE_KEYS honesty; zero new attack surface |
| **Cons** | Commercial “API by arrangement” stays non-product |
| **Fit** | Valid if N2 chooses permanent deferral |

---

## 5. Decision matrix (proposed defaults for Option A)

| Topic | Decision |
|-------|----------|
| **Authentication method** | `Authorization: Bearer bb_live_…` (or `bb_test_…`) — **not** cookies, **not** session tokens, **not** CSRF |
| **Token lifecycle** | Create (HQ or PA, Network-entitled) → **one-time raw secret display** → store **SHA-256 hash only** → optional expires_at → revoke sets `revoked_at` |
| **Secret storage** | Mirror sessions: raw only in create response; DB holds hash; never log raw; never re-show full secret |
| **Secret display / rotation** | Show once on create; rotate = create new + revoke old; prefix + last4 for identification |
| **Revocation** | Immediate fail-closed on hash lookup; list active keys; audit `api_key.created` / `api_key.revoked` / `api_key.rotated` |
| **Scopes** | Narrow allowlist strings, e.g. `branches:read`, `attendance.aggregates:read`, `giving.aggregates:read`, `events:read`, `announcements:read` — default **minimal** set at create |
| **Tenant / church boundaries** | Key bound to **one** `organization_id` + **one** `church_id` (UUID). Host header / tenant resolution must match binding. Cross-church → 403 |
| **Branch boundaries** | Optional `branch_id` restriction on the key; else all active branches of that church for scoped GETs. Never accept client-supplied church UUID that differs from key binding |
| **Rate limiting** | Per key + per IP; fail 429 with stable error body; start conservative (e.g. low hundreds/min) — exact numbers = ops SoT |
| **IP restrictions** | **Optional** allowlist CIDRs on the key (recommended for assisted activations); empty = any IP (document risk) |
| **Audit logging** | Every authenticated API request: action category `api.*`, outcome, key id (not secret), route, status — **no** query dump of PII |
| **Versioning** | URI prefix `/api/v1/…` only; breaking changes → `/api/v2` |
| **Pagination** | Cursor or `limit`+`before` (same spirit as audit list); max page size capped (e.g. 100) |
| **Error format** | JSON `{ "ok": false, "error": { "code": "forbidden", "message": "…" } }` — stable `code`; no stack traces; no SQL |
| **Entitlement** | Soft/hard `assertFeature(api_access)` on key create and on every request |
| **CSRF** | N/A for Bearer API; browser cookie sessions remain CSRF-protected and **must not** authorize `/api/v1` |

---

## 6. Data allowed vs prohibited (v1)

### Allowed (read-only aggregates / catalogues)

| Resource (illustrative) | Notes |
|-------------------------|--------|
| Branches | key, display name, type, status — no private notes |
| Attendance monthly aggregates | Same statuses as HQ reports; category/branch totals |
| Giving monthly aggregates | Currency totals / category / branch — **no donors** |
| Published events | Public fields only |
| Announcements (published metadata) | Title/status/dates — not private drafts as default |
| Operational request **counts** | Status counts only — not message bodies |

Reuse existing HQ aggregate services (`getHqOperationalReport`, attendance/giving monthly summaries) where possible — do not invent parallel SQL.

### Prohibited by default

| Data | Reason |
|------|--------|
| Member directory PII (email, phone, address) | Privacy inventory **PII** / HIGH |
| Form submission answers | HIGH |
| Prayer / pastoral / request **message** bodies | Confidentiality |
| Donor-level giving / payment instruments | FINANCIAL + privacy |
| Individual attendance person-level rows | Not in V5 aggregate product |
| Passwords, session tokens, transfer tokens, CSRF secrets | Security |
| Platform admin / cross-org data | Tenant isolation |
| Private media bytes via API key without separate media policy | Attachment security |

### Write operations

| Class | v1 |
|-------|-----|
| POST/PATCH/DELETE on domain data | **Prohibited** |
| Key create/rotate/revoke via HQ HTML | Allowed (browser session + CSRF) — not via the API key itself for v1 |

---

## 7. First safe API resources (when N2 + Option A approved)

Ordered for minimal risk:

1. `GET /api/v1/church` — church display identity for the bound tenant  
2. `GET /api/v1/branches` — active branches catalogue  
3. `GET /api/v1/reports/attendance?month=YYYY-MM` — aggregate headcounts  
4. `GET /api/v1/reports/giving?month=YYYY-MM` — aggregate amounts by currency  
5. `GET /api/v1/events` — published events only  

**Not in first slice:** members, registrations detail, forms, requests bodies, media download, webhooks, writes.

---

## 8. Required security controls (checklist before code)

| # | Control |
|---|---------|
| S1 | Separate credential table (hash-only); never reuse `deployment_sessions` raw cookies |
| S2 | `api_access` entitlement on create + request |
| S3 | Church/org UUID binding enforced server-side |
| S4 | Scope checks per route (default deny) |
| S5 | Rate limit per key (+ IP); 429 audited |
| S6 | Optional IP allowlist |
| S7 | One-time secret display; rotate/revoke paths |
| S8 | Audit events without secrets or private bodies |
| S9 | No CORS reflection of secrets; discourage browser use (no wildcard credentialed CORS for keys) |
| S10 | Tests: Growth denial, cross-church 403, revoked/revoked key, scope denial, no PII in fixtures |
| S11 | Do not mount API behind apex session alone |
| S12 | Document assisted vs self-serve activation in HQ GUI copy |

---

## 9. Product decisions still open (N2)

| # | Decision | Blocks |
|---|----------|--------|
| P1 | Ship software API vs permanent assisted-only (Option D) | Any implementation |
| P2 | Self-serve HQ key minting vs PA/ops-only create | GUI + entitlement UX |
| P3 | Confirm Option A vs B for v1 | Schema + auth middleware |
| P4 | Exact rate limits and whether IP allowlist is mandatory | Ops SoT |
| P5 | Whether `reports.api` catalogue claim becomes FEATURE_KEYS honesty after ship | Marketing |

---

## 10. Safe next batch (after N2 chooses A)

| Batch | Scope | Stop |
|-------|--------|------|
| **NW-API-01** | Design acceptance + hash-only key schema + `GET` branches + attendance/giving aggregates + entitlement + audit + Growth denial tests | No writes · no PATs · no OAuth · no webhooks · no member PII · no Stitch invention |

Until N2: **no code**.

---

## 11. Conclude

| Label | Result |
|-------|--------|
| READY TO IMPLEMENT READ-ONLY API | **No** (pending N2) |
| **PRODUCT DECISION REQUIRED** | **Yes** |
| DEFER | Valid if P1 chooses no software API |

**Recommended model when unblocked:** Option **A** (read-only API keys), narrow scopes, first resources in §7, controls in §8.

---

## Stop

Design recorded. No public API endpoints, keys, or entitlement activation implemented in this task.
