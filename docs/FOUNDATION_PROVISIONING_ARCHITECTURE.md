# Foundation Provisioning & Basic/Free Plan Architecture (Prompt 2C)

**Status:** Architecture decision — analysis only  
**Date:** 2026-07-19  
**Inputs:**
- [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
- [`docs/FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md)
- [`docs/FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md`](./FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md)

**Constraints:** No code, migrations, routes, data, or V4 changes in this prompt.  
**Hard rule:** Do **not** copy or call V4 `provisionChurchOrganization` / `public.church_*`.

---

## 1. Executive recommendation

Create one HTTP-safe orchestrator:

**`provisionRegisteredBlessBoardChurch(db, input, actorContext)`**

It must **reuse** (not reimplement):

| Step | Existing service |
|------|------------------|
| Platform tenant | `provisionPlatformTenant` |
| BlessBoard church + HQ | `provisionBlessBoardChurch` |
| Admin user | `createBlessBoardUser` |
| Roles | `assignBlessBoardRole` |
| Plan | `assignOrganizationPlan` (already invoked inside tenant provision for BlessBoard / `free`) |
| Audit | `recordAuditEvent` / `recordAuditEventSafe` |

**Canonical Basic/Free catalogue key today:** `platform.plans.plan_key = **free**` (product `blessboard`).  
Public registration vocabulary **`foundation`** remains the marketing/application code and must **map to** `free` at provision time until a plan_key migration lands.

**Transaction-readiness:** Each CLI service is **internally** transactional (`BEGIN`/`COMMIT` on its client) but **not safely composable** inside an outer HTTP transaction (nested `COMMIT` would finalize early). **Required refactor before production HTTP use:** add a caller-owned transaction mode (`client` + `manageTransaction: false`) to all four services (and plan assign if called separately).

---

## 2. Existing reusable services

| Service | File | Creates / updates | Own TX? | Idempotent? |
|---------|------|-------------------|---------|-------------|
| `provisionPlatformTenant` | `src/platform/services/provisionPlatformTenant.js` | `platform.organizations`, enrolment, domain, default BlessBoard subscription via `assignOrganizationPlan(..., planKey: "free")` | Yes (`BEGIN`/`COMMIT`) | Yes — `already_provisioned` if matches |
| `provisionBlessBoardChurch` | `src/blessboard/services/provisionBlessBoardChurch.js` | `blessboard.churches`, HQ `branches` | Yes | Yes — match existing |
| `createBlessBoardUser` | `src/blessboard/services/createBlessBoardUser.js` | `blessboard.users` | Yes | Partial — same email+name+password → `already_exists`; else `identity_conflict` |
| `assignBlessBoardRole` | `src/blessboard/services/assignBlessBoardRole.js` | `blessboard.user_roles` | Yes | Yes — `already_assigned` |
| `assignOrganizationPlan` | `src/platform/services/entitlementService.js` | `organization_subscriptions` (+ entitlement resolution) | Called inside tenant TX today | Current-sub aware |
| `recordAuditEvent` | `src/platform/services/auditEventService.js` | `platform.audit_events` | Own client handling | Append-only |

**Entitlement source:** `platform.plan_features` for the org’s current subscription plan, plus optional `platform.organization_entitlements` overrides. Enforcement via `entitlementService` (`assertFeature`, capacity checks in church provision / role assign).

**Payment:** Zero-cost Free/Foundation needs **no payment record**. Subscription row only.

---

## 3. Transaction-readiness verdict

| Verdict | Detail |
|---------|--------|
| **Per-service** | Transaction-aware and production-used via CLI |
| **Composable under one outer TX** | **NOT READY** — each service issues its own `BEGIN`/`COMMIT` when given a pool **or** a client |
| **Risk if orchestrator wraps them naively** | Inner `COMMIT` commits outer work; failure later leaves committed orphans; inner `ROLLBACK` can abort unexpected state |

### Required consolidation approach (before HTTP self-serve)

**REQUIRED refactor (all four provision/user/role services):**

```text
options = { manageTransaction: true | false }
```

- `manageTransaction: true` (default) — current CLI behavior.  
- `manageTransaction: false` — caller already in `BEGIN`; service must **not** `BEGIN`/`COMMIT`/`ROLLBACK` (only throw or return fail; caller rolls back).

Until that lands, HTTP orchestrator must **not** claim atomicity; at best a **saga** with `provisioning_status=provisioning_failed` and manual/ops cleanup — **unacceptable for Foundation launch**.

**Optional later:** extract pure `*InTransaction(client, input)` cores shared by CLI and orchestrator.

---

## 4. Orchestrator contract

### 4.1 Responsibility

`provisionRegisteredBlessBoardChurch` is the **only** self-serve path that turns a validated registration application into a live Foundation tenant. It:

1. Loads/locks the application row.  
2. Normalizes keys/slug/plan.  
3. Runs the V5 chain in one caller-owned transaction (after refactor).  
4. Creates onboarding sidecar defaults (per 2B).  
5. Updates application provisioning fields.  
6. Writes audit events.  
7. Returns portal destination metadata (does not create sessions).

It does **not** render HTTP, send email, or implement path routing.

### 4.2 Conceptual signature

```js
/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {object} input
 * @param {{ actorType: 'system'|'platform_admin', actorUserId?: string, requestId?: string }} actorContext
 * @returns {Promise<ProvisionRegisteredResult>}
 */
async function provisionRegisteredBlessBoardChurch(db, input, actorContext)
```

### 4.3 Required input

| Field | Source | Notes |
|-------|--------|-------|
| `applicationId` | Registration row | Primary idempotency key |
| `organizationKey` | Normalized from church name / explicit slug | Must pass `organization_key` format |
| `displayName` | `church_name` | Org + church display |
| `adminEmail` | `contact_email` | Normalized lower-case |
| `adminDisplayName` | `contact_name` | |
| `adminPassword` | Form (new field) or generated one-time | Min length per `createBlessBoardUser` (≥10) |
| `churchKey` | Default = `organizationKey` or derived | Unique church key |
| `hqBranchKey` | Default `hq` or `main` | Single HQ |
| `hqBranchDisplayName` | Default from church/branch_name | |
| `dataEnvironment` | Deployment policy | e.g. `testing` / `production` |
| `deploymentCode` | Env / platform deployment | Required by tenant provision today |
| `productKey` | Constant `blessboard` | |
| `productTenantKey` | Usually = `organizationKey` | Enrolment tenant key |
| `planKey` | Always map Free → **`free`** | Ignore paid plans for this orchestrator’s Foundation path |
| `countryCode` / `timezone` | Optional from form | |
| `hostname` / `skipDomain` | See §7 | Path-first Foundation |

### 4.4 Validation and normalization

| Layer | Responsibility |
|-------|----------------|
| HTTP / registration validation | Form shape, consent, plan alias → `foundation` on application |
| Orchestrator | Application exists; `provisioning_status` allows run; slug format; reserved slug check; map `foundation`→`free`; password policy; email normalize |
| Child services | Keep their existing `validateAndNormalizeInput` — orchestrator passes already-normalized values |

Reject Growth/Network in this orchestrator (separate paid flows later).

### 4.5 Transaction boundary

**Target (after refactor):**

```text
BEGIN
  lock application FOR UPDATE
  set provisioning_status = provisioning
  provisionPlatformTenant(..., manageTransaction: false)
  provisionBlessBoardChurch(..., manageTransaction: false)
  createBlessBoardUser(..., manageTransaction: false)
  assignBlessBoardRole × N (..., manageTransaction: false)
  insert organization_onboarding defaults
  update application: organization_id, provisioning_status=provisioned
  insert audit events
COMMIT
```

On any fail → `ROLLBACK` → set `provisioning_status=provisioning_failed` in a **new** short transaction (status update must survive rollback).

### 4.6 Idempotency strategy

| Key | Rule |
|-----|------|
| Primary | `applicationId` |
| If `provisioning_status=provisioned` and `organization_id` set | Return success `already_provisioned` with existing records (no duplicate org) |
| If `provisioning_status=provisioning` | Return `provisioning_in_progress` or wait/lock — do not start a second chain |
| If `provisioning_failed` | Allow retry with same keys; child services’ idempotent match paths reuse created rows |
| Secondary | `organizationKey` uniqueness — conflict → fail `organization_conflict` (may mark `duplicate_review` on application) |

Do **not** use email alone as provision idempotency (one person may admin multiple orgs later).

### 4.7 Records created

| Record | Table |
|--------|-------|
| Organization | `platform.organizations` (`status=active`) |
| Enrolment | `platform.organization_products` |
| Subscription | `platform.organization_subscriptions` → plan `free` |
| Domain | Optional — see §7 |
| Church | `blessboard.churches` (`status=active`) |
| HQ branch | `blessboard.branches` (`branch_type=hq`, primary) |
| Admin user | `blessboard.users` |
| Roles | `church_hq_admin` + `branch_admin` on HQ (see §4.17) |
| Onboarding sidecar | `organization_onboarding` (when table exists) |
| Support notes | None at provision |

### 4.8 Records updated

| Record | Update |
|--------|--------|
| Application | `provisioning_status`, `organization_id`, `updated_at`; optionally `application_status` |
| Entitlements cache/resolution | As side effect of plan assign |

### 4.9 Rollback behavior

- **In-TX failure:** full `ROLLBACK` of catalogue/user/role/onboarding inserts.  
- **Then:** persist `provisioning_status=provisioning_failed` + error code on application (separate TX).  
- **No** partial “leave org without user” for Foundation HTTP path after refactor.  
- Compensating deletes are **not** preferred if outer TX works.

### 4.10 Retry behavior

Safe when:

- Same `applicationId`, same normalized keys, prior status `provisioning_failed` or interrupted.  
- Child services return `already_provisioned` / `already_exists` / `already_assigned` for matching rows.

Unsafe when:

- Changing `organizationKey` after a partial success without cleanup.  
- Different password on existing email → `identity_conflict` (see duplicates).

### 4.11 Error classification

| Class | Examples | HTTP hint (later) |
|-------|----------|-------------------|
| `invalid_input` | Bad slug, password, missing fields | 400 |
| `application_state` | Wrong provisioning status | 409 |
| `organization_conflict` | Key taken / mismatch | 409 |
| `hostname_conflict` | Domain taken | 409 |
| `identity_conflict` | Email exists with different identity | 409 |
| `limit_exceeded` | Entitlement (should not fire on empty org) | 409 |
| `duplicate_review` | Suspected duplicate church/email policy | 409 |
| `transaction_error` / dependency | DB/deploy/product missing | 503 |
| `provisioning_failed` | Stored on application after rollback | 503 + retry |

Never return stack traces or connection strings.

### 4.12 Duplicate email handling

| Case | Behavior |
|------|----------|
| Email unused | Create user |
| Same email, same display name, same password | Treat as idempotent user (`already_exists`); continue roles |
| Same email, different password or display name | **Fail** `identity_conflict` — do not overwrite password; support resolves manually |
| Email already admin of another org | **Owner decision** — Foundation recommendation: **allow** second org via additional role assign if product policy permits; otherwise reject. Default for Foundation: **reject** multi-org auto-provision (`identity_conflict` / `duplicate_review`) to keep support simple |

### 4.13 Duplicate organization-name handling

- Display names are **not** unique in schema.  
- Uniqueness is **`organization_key`**.  
- Orchestrator generates key from name (slugify); on collision append short suffix or fail to `duplicate_review` if same contact email recently registered similar name (align with 15‑minute application idempotency).

### 4.14 Duplicate slug / key handling

- `organization_key` / `church_key` must match platform CHECK format.  
- Reserved slugs: reuse platform reserved lists from settings (`ORGANIZATION_RESERVED_SLUGS` / branch host reserved).  
- Conflict → fail; do not steal existing tenant.

### 4.15 Initial organization status

**`active`** on `platform.organizations`.  
Church **`active`**.  
Callback/follow-up is **not** an approval gate (per product flow).

### 4.16 Initial publication status

- No published public pages at provision (or only `draft` seeds if any).  
- Onboarding aggregate **`unpublished`**.  
- Public site must not be world-readable as a published church until checklist / explicit publish (path routing may still resolve a “coming soon” later — out of scope here).

### 4.17 Admin role assignment

| Role | Scope | Required? |
|------|-------|-----------|
| `branch_admin` | HQ branch | **Yes** — matches first portal `/branch-admin` |
| `church_hq_admin` | Church | **Yes** for Foundation single-campus (HQ tools) |
| `platform_admin` | — | **Never** via self-serve |

Both roles on one user count toward **`max_staff_accounts`** as one staff user (existing enforcement counts staff users, not duplicate people).

### 4.18 Portal destination

| Field | Value |
|-------|-------|
| Post-login tenant destination | **`/branch-admin`** (existing) |
| Apex login | `/login` then session / future path context |
| Orchestrator returns | `{ portalPath: "/branch-admin", organizationKey, churchKey, loginPath: "/login" }` |

Does not create `deployment_sessions` itself — HTTP login flow does.

### 4.19 Audit events

Use `recordAuditEvent` / Safe variant with codes such as:

- `blessboard.registration.provision.started`  
- `blessboard.registration.provision.succeeded`  
- `blessboard.registration.provision.failed`  
- Include `applicationId`, `organizationKey`, `actor`, `requestId`, error code — **no passwords**.

### 4.20 Return object (conceptual)

```js
{
  ok: true | false,
  status: "provisioned" | "already_provisioned" | "provisioning_failed" | "...",
  applicationId,
  organization: { id, key, status },
  church: { id, key, status },
  hqBranch: { id, key },
  user: { id, email, status },
  roles: [{ roleKey, churchKey?, branchKey? }],
  planKey: "free",
  publication: { websitePublicationStatus: "unpublished" },
  portal: { loginPath: "/login", destinationPath: "/branch-admin" },
  created: { /* booleans per step */ },
  message: "..."
}
```

---

## 5. Domain / hostname vs path-based Foundation

Today `provisionPlatformTenant` **requires** a hostname and inserts `platform.domains`.

| Option | Notes |
|--------|-------|
| A. Always insert a synthetic hostname | Keeps current API; DNS may not exist; host routing stays off |
| B. Add `skipDomain: true` | **Recommended** for path-first Foundation; domain added later for custom/subdomain |
| C. Call tenant provision then delete domain | Wasteful; avoid |

**Recommendation:** extend tenant provision to allow skipping domain when `routingMode: "path"` (future). Until then, architecture marks **hostname requirement as a blocking refactor** for pure path-based onboard.

---

## 6. Basic/Free plan audit

### 6.1 Canonical codes

| Layer | Value | Notes |
|-------|-------|-------|
| **Catalogue `plan_key` (authoritative for assign)** | **`free`** | Used by `provisionPlatformTenant` → `assignOrganizationPlan` |
| Product | **`blessboard`** (`platform.products.product_key`) | Not a UUID in assign APIs — key-based |
| Public / application `selected_plan` | **`foundation`** (aliases: free, basic, basic_free) | Must map → `free` at provision |
| Display | Seed: “Foundation”; live testing DB currently shows display_name **“Free”** for `free` | Drift — align display via seed/ops, not a new plan_key |
| Future rename to `foundation` | Blocked by immutable `plan_key` migration plan | Do not block Foundation on rename |

### 6.2 Live testing DB entitlements (`plan_key=free`) vs repo seed

| Feature | Seed `003_blessboard_plans.sql` | Live testing DB (2026-07-19) | Foundation product intent |
|---------|----------------------------------|------------------------------|---------------------------|
| `max_branches` | 1 | **2** | **1** (HQ only) |
| `max_users` | 250 | **10** | **10** |
| `max_staff_accounts` | 10 | **10** | **10** |
| `custom_domain` | false | false | false |
| `custom_email` | false | false | false |
| `basic_reports` | true | true | true |
| `advanced_reports` / executive | false | false | false |
| Mailboxes | 0 in seed | (not in live snippet) | none |

**Recommendation:** Treat **entitlement tables** as source of truth at runtime. Before launch, **reconcile live Free limits to Foundation intent** (`max_branches=1`, `max_users=10`, `max_staff_accounts=10`) via controlled plan_feature update — not hardcoded in the registration controller.

### 6.3 Subscription behavior (zero-cost)

- Insert/assign current subscription to `free` — **no invoice, no payment row**.  
- Entitlements resolve from plan features + overrides.  
- PA may later change plan via existing `/admin/organizations/:key/plan`.

### 6.4 Foundation policy (confirm)

| Rule | Policy | Enforced by |
|------|--------|-------------|
| 1 organization | Per registration | Orchestrator creates one |
| 1 HQ | Yes | `provisionBlessBoardChurch` HQ insert |
| 1 branch | Yes (= HQ only) | `max_branches=1` |
| Up to 10 users | Yes | `max_users=10` (members) + staff cap |
| Up to 10 staff | Yes | `max_staff_accounts=10` |
| No custom domain | Yes | `custom_domain=false` |
| No custom email | Yes | `custom_email=false` |
| Immediate portal access | Yes | User+roles; login → `/branch-admin` |
| Unpublished website | Yes | No published pages; onboarding `unpublished` |
| Path-based public URL | Product intent | Routing architecture (Prompt 2D) — not provision tables |
| No approval gate | Yes | Org `active` immediately |

---

## 7. Required future refactors

| Priority | Refactor |
|----------|----------|
| **REQUIRED** | `manageTransaction: false` (or equivalent) on tenant, church, user, role services |
| **REQUIRED** | Optional skip-domain / path routing mode on `provisionPlatformTenant` |
| **REQUIRED** | Orchestrator module + application lock + failed-status persistence |
| **REQUIRED** | Map `foundation` → `free` in one shared helper (registration + orchestrator) |
| **REQUIRED** | Create onboarding row defaults (depends on 2B migration) |
| **OPTIONAL** | Align live/seed Free limits (`max_branches`) |
| **OPTIONAL** | plan_key rename `free`→`foundation` (separate migration program) |
| **DEFER** | Email invite instead of password-at-register |
| **FORBIDDEN** | V4 `provisionChurchOrganization` |

---

## 8. Highest provisioning risk

1. **Nested transactions / partial commits** if HTTP orchestration ships before `manageTransaction` refactor.  
2. **Plan vocabulary drift** (`foundation` vs `free`) causing wrong or missing subscription.  
3. **Hostname required** while product wants path-only — forcing fake domains or blocked provision.  
4. **Email identity_conflict** locking real churches out without support tools.  
5. Copying **V4** provision into V5 (explicitly rejected).

---

## 9. Duplicate-prevention rules (provisioning)

- One orchestrator only for self-serve.  
- CLI remains for ops; should call the same cores, not a second business path.  
- No parallel “create org” HTTP that bypasses applications for Free self-serve (Stitch 64 stays ops/CLI unless later unified).  
- No second subscription writer besides `assignOrganizationPlan`.

---

## 10. Open owner decisions

1. Allow one email to administer multiple orgs via self-serve? (Default: no.)  
2. Password-at-register vs invited/`invited` status?  
3. Synthetic hostname vs `skipDomain` for path-first?  
4. Assign both `church_hq_admin` and `branch_admin`, or branch only? (Default: both.)  
5. Reconcile live `max_branches=2` → `1` before launch?

---

## 11. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes added  
- No V4 code changed  

**Companions:** 2A entity/admin · 2B status/onboarding · audit registration flow
