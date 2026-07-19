# Network — blocked features

**Date:** 2026-07-19  
**Branch:** `V5` @ `fa36fea`  
**Mode:** Documentation only  
**Companion:** [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_IMPLEMENTATION_QUEUE.md`](../gui/NETWORK_IMPLEMENTATION_QUEUE.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md)

**Purpose:** Exact blockers for Network capabilities that must **not** be queued as GUI-only or invented vertical slices.

---

## Legend

| Class | Meaning |
|-------|---------|
| **REQUIRES_EXTERNAL_SERVICE** | Third-party provider or ops protocol missing |
| **MISSING_BACKEND** | No V5 schema/service/route |
| **MISSING_GUI** | Backend/ops may exist; product UI absent |
| **PRODUCT_DECISION_REQUIRED** | Scope unsigned |
| **DEFERRED** | Catalogue aspiration |
| **NOT_SOFTWARE_FEATURE** | Commercial/ops promise |

---

## Blocked master table

| Order | Feature | Stitch IDs | Route | Backend | Entitlement | External dependency | Status | Blocker |
|------:|---------|------------|-------|---------|-------------|----------------------|--------|---------|
| B1 | Hosted mailboxes (≤5 / branch) | — | — | NONE | `custom_email` **false**; `max_mailboxes_per_branch` **0** (catalogue still lists 5) | **Mailbox hosting provider** (unapproved) | REQUIRES_EXTERNAL_SERVICE | No schema, adapter, credential vault, or provisioning API |
| B2 | Public API access | — | Catalogue `/hq/integrations/api` | NONE | Catalogue `integrations.public_api` | API auth protocol + gateway | REQUIRES_EXTERNAL_SERVICE | No tenant API keys, scopes, rate limits, or versioned surface |
| B3 | Webhooks | — | Catalogue `/hq/integrations/webhooks` | NONE | Catalogue `integrations.webhooks` | Delivery bus + signing secrets | REQUIRES_EXTERNAL_SERVICE | No outbox, endpoints registry, or retry policy |
| B4 | External integrations | — | — | NONE | Catalogue flags | Per-vendor APIs | REQUIRES_EXTERNAL_SERVICE | “By arrangement” only; no integration bus |
| B5 | DNS / SSL automation for custom domains | Settings-adapted `30e38567…` / `efb0fd24…` | PA domains (read/ops limited) | Registry PARTIAL | `custom_domain` | DNS provider + ACME/CA | REQUIRES_EXTERNAL_SERVICE | Explicitly **excluded** from Network queue; assisted manual only |
| B6 | Domain purchase / registrar checkout | — | — | NONE | — | Registrar API + billing | REQUIRES_EXTERNAL_SERVICE | Pricing: registrar fees separately quoted |
| B7 | Advanced custom role matrix | Roles `12f5be53…` / `de3e82ef…` (leader tier decorative) | `/hq/roles` fixed only | Fixed CHECK only | Soft seats | — | PRODUCT_DECISION_REQUIRED | Pricing: assisted / by arrangement; would need schema beyond `platform_admin` / `church_hq_admin` / `branch_admin` |
| B8 | Executive dashboards beyond Growth reports | Consolidated analytics pair | — | Growth reports only | `advanced_reports` | — | PRODUCT_DECISION_REQUIRED | Executive exports “by arrangement”; no separate executive product |
| B9 | Custom report templates / builder | Org templates `df111bee…` / `801584ed…` | — | NONE | Catalogue `reports.custom_builder` | — | MISSING_BACKEND | No template store or applicator |
| B10 | Network executive hierarchy UI | — | Catalogue `/hq/network/hierarchy` | NONE | Catalogue `network.executive_hierarchy` | — | MISSING_BACKEND | Multi-org hierarchy not in V5 model |
| B11 | Priority support customer portal | Support Stitch `74cbe4a0…` / `9f400420…` (reused as deployment detail) | — | N/A | Catalogue `priority_support` | Support desk / CRM | NOT_SOFTWARE_FEATURE | SLA/ops promise |
| B12 | Optional managed services | — | — | N/A | — | Contracts / staffing | NOT_SOFTWARE_FEATURE | Explicit audit exclusion |
| B13 | Payment collection / Network checkout | — | — | NONE | Billing catalogue cents only | Payment provider | DEFERRED | Pricing SoT non-goal |
| B14 | Tenant/HQ self-serve custom domain UI | — | — | Registry via PA/CLI | `custom_domain` | DNS | MISSING_GUI + PRODUCT_DECISION | SoT: assisted onboarding; **not** self-service DNS today |
| B15 | Enforce mailbox capacity (raise `max_mailboxes_per_branch` / `custom_email`) | — | — | Keys exist; values inactive | Limit 0 / boolean false | Provider | PRODUCT_DECISION_REQUIRED | Do not set live until provider + provision path ship |
| B16 | Plan-key migration `professional` → `network` | — | — | Analysis | Display remap | Migration window | PRODUCT_DECISION_REQUIRED | B12 release blocker — not Network GUI |
| B17 | Growth deferred catalogue on Network (surveys, schedules, offline, volunteers, appointments, pastoral engine) | Various / none | — | NONE | Commercial catalogue aspirational | Often jobs/workers | DEFERRED | Marketing honesty: **not** current product on any package |

---

## Exact missing dependencies

### B1 — Hosted mailboxes

1. Approved mailbox provider (and data-residency decision).  
2. `blessboard` or `platform` mailbox tables (org/church/branch scope, status, quota).  
3. Provisioning service with `custom_email` assert + capacity ≤ 5 per **active** branch.  
4. Credential/secret handling that never prints passwords into HTML/logs.  
5. Deprovision path for Network → Growth downgrade (pricing §5).

### B2–B4 — API / webhooks / integrations

1. Product protocol decision (REST/GraphQL, auth: keyed vs OAuth, event catalog).  
2. Persistence for clients, endpoints, delivery attempts.  
3. Worker/runtime for outbound delivery (jobs currently disabled on V5).  
4. Church/organization scoping + audit events.  
5. Commercial “by arrangement” activation workflow (not self-serve toggle alone).

### B5–B6 — DNS / SSL / purchase

1. Approved DNS/ACME automation design **or** permanent manual runbook.  
2. Until then: keep PA domains as **registry + status**, not automation.

### B7 — Advanced roles

1. Product decision: which roles beyond fixed three (leader forbidden unless role SoT changes).  
2. Schema migration relaxing or extending `user_roles.role_key` CHECK.  
3. Authorization matrix + seat accounting.  
4. Stitch chrome that does **not** invent Ministry Leader without role SoT.

### B8–B10 — Executive / templates / hierarchy

1. Product definition of “executive export” vs existing HQ aggregates.  
2. Template schema + safe applicator (overwrite policy).  
3. Whether multi-organization hierarchy is in Network scope at all.

---

## Safe work while blocked

Allowed without clearing blockers (see queue):

- PA Network plan/entitlement **honesty** copy  
- Domains directory/detail **ops chrome** without automation  
- Entitlement **isolation** tests (Growth cannot claim Network flags)  
- Apex marketing residual honesty  

Forbidden until blockers clear:

- Mailbox CRUD GUI  
- API key / webhook endpoint GUI that implies live delivery  
- Self-serve DNS verify / SSL issue buttons  
- Custom role matrix UI  
- Managed-service “order” flows  
- Checkout / Stripe  

---

## Product decisions still open (Network)

| # | Decision | Blocks |
|---|----------|--------|
| N1 | Approve mailbox provider + capacity enforcement model | B1, B15 |
| N2 | API/webhook protocol + whether self-serve or assisted-only | B2–B4 |
| N3 | Advanced roles: which keys, who assigns, Network-only? | B7 |
| N4 | Executive exports: file formats, PII rules, entitlement key | B8 |
| N5 | Custom report templates vs “by arrangement” ops-only | B9 |
| N6 | Tenant self-serve domain UI vs permanent assisted-only | B14 |
| N7 | Persist `plan_key` rename to `network` (B12 migration) | B16 |
| N8 | Elevate any Growth DEFERRED catalogue row as Network sold software | B17 |

---

## Unblock order (if funded)

1. **N6 + domain ops polish** (queue NW-Q02) — no external provider.  
2. **N7** plan-key migration — separate cutover program.  
3. **N3** advanced roles — schema program after SoT.  
4. **N1** mailboxes — only after provider.  
5. **N2** API/webhooks — only after protocol.  
6. **N4/N5** executive/templates — product definition first.  
7. **N8** never by default — each Growth deferred item is its own program.

---

## Stop

Blocked-feature register complete. Do not invent GUI for rows in this file.
