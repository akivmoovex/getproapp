# Foundation Provisioning & Basic/Free Plan Architecture (Prompt 2C)

**Status:** Architecture decision — analysis only (expanded)  
**Date:** 2026-07-19  

**Inputs:**
- [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
- [`docs/FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md)
- [`docs/FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md`](./FOUNDATION_ONBOARDING_STATUS_ARCHITECTURE.md)
- Live V5 testing DB (SELECT only)

**Constraints:** No code, migrations, DB writes, routes, controllers, registration implementation, path tenancy, admin UI, dashboards, or V4 changes. **Do not copy** V4 `provisionChurchOrganization`.

---

## 1. Executive recommendation

Create one shared orchestrator:

**`provisionRegisteredBlessBoardChurch(db, input, actorContext)`**  
(module suggestion: `src/blessboard/services/provisionRegisteredBlessBoardChurch.js`)

It reuses (does not reimplement) the V5 CLI services after a **small transaction-composability refactor**, and is callable from:

- public Basic/Free self-registration,
- future PA Create Organization,
- CLI,
- failed-application retry,
- assisted onboarding.

**After success (approved 2B):**

| Field | Value |
|-------|--------|
| `provisioning_status` | `provisioned` |
| `application_status` | `closed` |
| `organization_id` | new org UUID |
| org / church status | `active` |
| admin user status | `active` |
| site | **unpublished** (neutral setup page publicly, not 404) |
| follow-up | `new` on `organization_onboarding` — **never blocks portal** |

**Catalogue plan for assignment:** `platform.plans.plan_key = **free**` (`product_key = blessboard`).  
Public form code `foundation` **maps to** `free`.

**Transaction verdict today:** each step is TX-safe alone but **NOT composable** under one outer TX until `manageTransaction: false` (or equivalent) lands.

---

## 2. Existing provisioning call graph

```text
CLI npm run platform:tenant:provision
  └─ provisionPlatformTenant(pool|client)
       BEGIN
       ├─ insert/find platform.organizations
       ├─ assignOrganizationPlan(..., planKey: "free")  → organization_subscriptions + entitlement resolve
       ├─ insert/find platform.organization_products (enrolment)
       └─ insert/find platform.domains (hostname required today)
       COMMIT

CLI npm run blessboard:church:provision
  └─ provisionBlessBoardChurch(pool|client)
       BEGIN
       ├─ assert org + enrolment
       ├─ insert/find blessboard.churches
       └─ insert/find HQ blessboard.branches (entitlement max_branches)
       COMMIT

CLI npm run blessboard:user:create
  └─ createBlessBoardUser(pool|client)
       BEGIN → bcrypt hash → insert blessboard.users → COMMIT

CLI npm run blessboard:user:role:assign
  └─ assignBlessBoardRole(pool|client)
       BEGIN → insert blessboard.user_roles (staff capacity) → COMMIT

(optional later) content seed / public_pages — not in current Free CLI chain by default
audit: recordAuditEvent — separate; often after success
```

**No single HTTP orchestrator exists.** Partial CLI runs can leave org without church/user.

---

## 3. Function inventory (summary)

| Function | File | Writes | Accepts client? | Own BEGIN/COMMIT? | Idempotent? | Side effects | Tests | Prod |
|----------|------|--------|-----------------|-------------------|-------------|--------------|-------|------|
| `provisionPlatformTenant` | `src/platform/services/provisionPlatformTenant.js` | orgs, enrolment, domains, sub via plan assign | Pool or Client | **Yes always** | Yes if match | none external | platform provision tests | CLI |
| `assignOrganizationPlan` | `entitlementService.js` | `organization_subscriptions` | Client | No (caller TX) when called inside tenant | Current-sub aware | none | entitlements tests | CLI+PA |
| `provisionBlessBoardChurch` | `provisionBlessBoardChurch.js` | churches, HQ branch | Pool or Client | **Yes always** | Yes if match | none | church provision tests | CLI |
| `createBlessBoardUser` | `createBlessBoardUser.js` | users | Pool or Client | **Yes always** | Partial (same email+name+password) | bcrypt CPU | user tests | CLI |
| `assignBlessBoardRole` | `assignBlessBoardRole.js` | user_roles | Pool or Client | **Yes always** | Yes | none | role tests | CLI |
| `recordAuditEvent` | `auditEventService.js` | audit_events | Pool/client | Own handling | append | none | audit tests | various |
| CLI wrappers | `db/scripts/*-provision.js` etc. | via services | Pool | N/A | dry-run default | stdout report | CLI safety | ops |

**Public-page seeding:** not part of the core four-step CLI chain; content/onboarding may create drafts later. Prefer **structured empty/draft placeholders**, never published demo leaders/events.

---

## 4. Transaction-readiness matrix

| Function | Class | Notes |
|----------|-------|-------|
| `provisionPlatformTenant` | **PARTIALLY** | Accepts client but always BEGIN/COMMIT |
| `provisionBlessBoardChurch` | **PARTIALLY** | Same |
| `createBlessBoardUser` | **PARTIALLY** | Same; bcrypt inside TX (acceptable if short) |
| `assignBlessBoardRole` | **PARTIALLY** | Same |
| `assignOrganizationPlan` | **TRANSACTION-READY** | Uses passed client |
| `recordAuditEvent` | **PARTIALLY** | Prefer after commit or same TX with care |

### Explicit answers

1. **Not safely today** — nested COMMIT would finalize early.  
2. Services prefer passed db; CLIs open Pool.  
3. **Yes** — each of the four owns COMMIT.  
4. Bcrypt only (CPU); no email/DNS in chain.  
5. Domain row insert only (no live DNS); **skipDomain** needed for path-first.  
6. After refactor yes; today CLI partials possible across steps.  
7. UUIDs safe to retry; unique keys drive conflicts.  
8. **Yes** — CLI can leave org without church/user.  
9. Smallest refactor: `manageTransaction: false` + optional `skipDomain` on tenant provision.  
10. **Yes** — CLI should later call the shared orchestrator (or same cores).

---

## 5. Shared orchestrator contract

### Name & responsibility

`provisionRegisteredBlessBoardChurch` — sole writer that turns a validated application (or admin/CLI equivalent input) into a Free BlessBoard tenant + admin + onboarding row, then closes the application.

### Conceptual input

```text
{
  applicationId,              // required for self-serve / retry
  organizationKey,            // normalized slug
  displayName,                // church/org name
  country, city,
  contactName, contactEmail, contactPhone,
  passwordHash,               // preferred: hash OUTSIDE or at security boundary before DB writes
  // OR passwordPlaintext only inside a single documented hasher step — never log
  productKey: "blessboard",
  planKey: "free",            // after foundation→free map
  hqBranchKey, hqBranchDisplayName,
  dataEnvironment, deploymentCode,
  skipDomain: true,           // Foundation path-first
  actorContext: { type, userId?, requestId? }
}
```

**Password:** Prefer controller/service boundary hashes with bcrypt **before** orchestrator DB phase, passing `passwordHash` only. If plaintext accepted, hash once at the top of the orchestrator and never log it.

### Contract bullets

1. **Required:** applicationId (self-serve), org key, display name, admin email, password hash, product/plan, deployment/env, HQ branch keys.  
2. **Optional:** legal name, timezone, country code, phone, message (already on app).  
3. **Normalize:** email lower, slug lower, plan alias→`free`.  
4. **Validation:** application state machine + child validators.  
5. **Authorization:** public path only Free/foundation; PA/CLI may pass actor.  
6. **Hashing:** security boundary as above.  
7. **TX:** one outer BEGIN…COMMIT after refactor.  
8. **Idempotency key:** `applicationId`.  
9. **Lock:** `SELECT … FOR UPDATE` on application row.  
10–11. **Create/update:** see §6–7.  
12. **Audit:** after successful commit (or in-TX if fail-safe).  
13. **Return:** org/church/branch/user/roles/portal paths/status.  
14. **Retry:** see §8.  
15. **Errors:** see §14.  
16. **Logs:** requestId, applicationId, org key, status codes — no secrets.  
17. **Rollback:** full TX; then persist `provisioning_failed` in new short TX.  
18–20. CLI / PA create / self-register all call this service with different actors.

---

## 6. Atomic creation sequence (recommended)

```text
BEGIN
  1. Lock application FOR UPDATE
  2. If provisioning_status=provisioned → return already_provisioned (COMMIT noop)
  3. If provisioning → return in_progress
  4. Validate plan free + map foundation
  5. Reserve/check organization_key uniqueness (+ reserved slugs)
  6. Set provisioning_status=provisioning, provisioning_started_at
  7. provisionPlatformTenant(..., manageTransaction:false, skipDomain:true)
  8. (subscription already via plan assign inside tenant step)
  9. provisionBlessBoardChurch(..., manageTransaction:false)
 10. createBlessBoardUser(..., status:active, manageTransaction:false)
 11. assignBlessBoardRole church_hq_admin + branch_admin on HQ
 12. Insert draft public_pages stubs OR defer to onboarding (see §11) — prefer minimal drafts unpublished
 13. Insert organization_onboarding (follow_up=new, checklist defaults)
 14. Link application.organization_id; provisioning_status=provisioned; timestamps
 15. application_status=closed
COMMIT
 16. Audit events (post-commit preferred)
 17. Optional session create (HTTP only, after commit)
```

**First record:** application lock.  
**Uniqueness locks:** organization_key, email_normalized, (optional) church_key.  
**After commit only:** session cookie, emails, CDN purges.  
**Not inside long TX:** external DNS, mail, payment.

---

## 7. Records created / updated

**Created:** `platform.organizations`, enrolment, `organization_subscriptions` (free), `blessboard.churches`, HQ `branches`, `users`, `user_roles` (hq + branch_admin), `organization_onboarding`, optional draft `public_pages`.  
**Not created (Foundation path):** custom domain (skip), payment customer, invoices.  
**Updated:** application (`provisioning_*`, `organization_id`, `application_status=closed`).

---

## 8. Idempotency strategy

| Item | Rule |
|------|------|
| Key | `applicationId` |
| Constraints | org key unique; email unique; application organization_id unique when set |
| Lock | FOR UPDATE on application |
| Already provisioned | Return existing org + `already_provisioned` |
| In progress | `PROVISIONING_IN_PROGRESS` — do not start second chain |
| Failed | Allow retry with same keys |
| Org exists, app unlinked | `duplicate_review` / ops repair — do not auto-link mismatched |
| Slug taken | fail `SLUG_UNAVAILABLE` (or suggest suffix — owner) |
| Email taken | see §9 |
| Lost response after commit | Retry returns already_provisioned |

Do **not** use 15‑minute form idempotency as provisioning primary key (that remains intake-only).

---

## 9. Duplicate policies

### Name
Allowed globally. Not a uniqueness key.

### Slug (`organization_key`)
- Normalize: lowercase, `^[a-z][a-z0-9_-]{0,63}$`  
- Reserved: existing org reserved set + path prefixes (`c`, `admin`, `login`, …)  
- Collision: **reject** with suggestion optional; **no silent auto-suffix** for self-serve without user confirm (owner may allow `-2` later)  
- Same as routing slug for `/c/:slug`

### Email (global unique on `blessboard.users.email_normalized`)

| Q | A |
|---|---|
| Scope | **Global** users table |
| Multi-org | Roles can attach one user to many orgs **in principle**; self-serve Foundation should not auto-attach |
| Unique? | **Yes** globally |
| Existing user | **Do not** password-overwrite |
| Self-register | If email exists → **`duplicate_review`** (or block with “sign in / contact support”) — **safest Foundation default: `duplicate_review`**, no auto role grant |
| Takeover | Never set password on existing user from public form |
| Multi-church person | Supported later via PA/CLI role assign; not auto from Free form |

### Phone
**Allowed** duplicate (shared office lines). Informational only; do not block.

---

## 10. Basic/Free plan audit (live testing DB)

| Item | Value |
|------|--------|
| Product code | **`blessboard`** (`id` `2119a16a-…`) |
| Plan key (catalogue) | **`free`** (`id` `fe0511d8-…`) |
| Display name (live) | `Free` (seed text often “Foundation”) |
| Status | `active` |
| Price / interval | **None in platform.plans** — catalogue not a price book |
| Billing | No payment provider required for Free |
| `max_branches` | **2** live / **1** in seed `003` — **mismatch** |
| `max_users` | **10** live |
| `max_staff_accounts` | **10** live |
| `custom_domain` | false |
| `custom_email` | false |
| `basic_reports` | true |
| `advanced_reports` | false |
| Registration form code | `foundation` (+ aliases) → must map to **`free`** |
| Provision default | already `planKey: "free"` |

**Recommend:** reconcile live `max_branches` → **1** (HQ only) before launch; enforce via `plan_features` only.

---

## 11. Zero-cost subscription model

**Choose:** normal `organization_subscriptions` row via `assignOrganizationPlan` to `free` — **price zero / no payment objects**.

| Aspect | Policy |
|--------|--------|
| Status | Active current subscription |
| Start | provision time |
| Renewal / end | none / open-ended for Free |
| Payment provider | **none** |
| Invoice / webhook | **none** |
| Cancel | PA plan change / org retire |
| Upgrade | Existing PA plan assign to growth/network when entitled |

Reject: entitlement-only without subscription (breaks PA subscription list), permanent trial flags, special org booleans.

---

## 12. Foundation entitlements (confirmed policy)

| Limit | Policy | Source of truth |
|-------|--------|-----------------|
| 1 organization | per registration | orchestrator |
| 1 church | UNIQUE organization_id | schema |
| 1 HQ / 1 branch | HQ only | `max_branches=1` plan_features |
| ≤10 users | members | `max_users` |
| ≤10 staff | admins | `max_staff_accounts` |
| Path URL/portal | product routing | 2D helper; not a plan boolean today |
| No custom domain/email | | plan booleans |
| Basic reports only | | plan booleans |
| Immediate portal | | user active + roles |
| Unpublished site | | public_pages + aggregate |
| Callback optional | | follow-up statuses |

**Canonical enforcement:** `entitlementService` / plan_features — **not** duplicated hardcoded in controller + UI + service independently (UI may display; service must assert).

---

## 13. Initial record values (success)

| Entity | Initial |
|--------|---------|
| Application | `application_status=closed`, `provisioning_status=provisioned`, `organization_id` set, timestamps set, error fields null |
| Organization | `status=active`, BlessBoard enrolment active, subscription `free` |
| Church | `status=active`, key/name/country as provided |
| Branch | HQ, `active`, primary |
| Admin user | `status=active`, password set |
| Roles | `church_hq_admin` + `branch_admin` on HQ |
| Onboarding | `follow_up_status=new`, assignee null, checklist mostly false, `onboarding_status=not_started` |
| Public pages | draft/unpublished only; **no fabricated content** |
| Publication aggregate | `unpublished` |

---

## 14. Starter content policy

**Recommend:** create **minimal draft page shells** (home/about placeholders) **or** create pages on first editor visit — either way **never published** and **never** seeded with fake leaders, sermons, events, giving, or contact details.

Public `/c/:slug` while unpublished → **neutral setup page** (approved), not 404.

---

## 15. Administrator access after provisioning

| # | Recommendation |
|---|----------------|
| 1 | POST may create account in TX; **session only after COMMIT** |
| 2 | **Prefer auto-login after commit** for Free UX (regenerate session) |
| 3 | Fallback: success page + link to `/login` if session fails |
| 4–5 | New session id after privilege grant; do not reuse pre-login anon CSRF session as auth session carelessly |
| 6 | Store org/church/branch context per existing V5 session model |
| 7 | First view: **`/c/:slug/branch-admin`** (2D) or interim `/branch-admin` until path phase |
| 8 | Show success + “Sign in” if auto-login fails; account already exists |
| 9 | Password reset deferred; support via PA if locked out |
| 10 | Success: application received + church ready + CTA to portal |

**Safest low-friction:** commit → create session → 303 to portal; on session error → 303 success page with login CTA.

---

## 16. Error taxonomy

| Code | Retryable | App status | Prov status | User message | Severity | Admin |
|------|-----------|------------|-------------|--------------|----------|-------|
| INVALID_INPUT | no | unchanged | unchanged | fix fields | info | no |
| INVALID_PLAN | no | unchanged | unchanged | invalid plan | warn | no |
| APPLICATION_NOT_FOUND | no | — | — | generic | warn | yes |
| APPLICATION_ALREADY_PROVISIONED | soft yes | closed | provisioned | already set up / sign in | info | no |
| PROVISIONING_IN_PROGRESS | yes wait | submitted | provisioning | try shortly | info | yes |
| DUPLICATE_EMAIL_REVIEW | no | duplicate_review | not_started/failed | under review | warn | yes |
| SLUG_UNAVAILABLE | no | submitted | not_started | choose another URL | info | no |
| DATABASE_CONFLICT | maybe | varies | failed | try again | error | yes |
| DATABASE_UNAVAILABLE | yes | unchanged | failed | try again | error | yes |
| PROVISIONING_FAILED | yes | submitted | failed | try again / support | error | yes |
| INTERNAL_ERROR | maybe | unchanged | failed | try again | error | yes |

No SQL/internal IDs in public messages.

---

## 17. Audit events (minimum)

Post-commit (preferred):  
`registration.provisioning.started` (or in-TX), `organization.created`, `blessboard.church_created`, `branch.created`, `administrator.created`, `role.assigned`, `subscription.assigned`, `onboarding.created`, `provisioning.completed` / `provisioning.failed`.

Actor, subject, organizationId, applicationId, requestId, safe metadata only.

---

## 18. Security controls

**Launch-required:** CSRF, rate limit, parameterized SQL, bcrypt, plan tamper check (server-side free only), slug reserved list, no password logs, TX rollback, no role→platform_admin, entitlement asserts, suspend overrides access.  

**Defer:** full email verify, advanced bot scores, phone fraud scoring.

---

## 19. Required refactors (before HTTP)

| Item | Reason | CLI impact | Risk |
|------|--------|------------|------|
| `manageTransaction` on 4 services | Outer TX | default true preserves CLI | low if tested |
| `skipDomain` on tenant provision | Path-first | CLI still passes hostname | low |
| Shared `mapPlanCodeToCatalogueKey` | foundation→free | one helper | low |
| Shared slug normalizer + reserved | collision | CLI | low |
| New orchestrator module | single path | CLI later wraps it | med |
| Application lock + status updates | 2B model | needs Phase 1 schema | depends on migrations |

Avoid repo-wide rewrite.

---

## 20. Future test matrix

**Unit:** normalize, slug, plan map, error classes, idempotency decisions.  
**Integration:** success path; retry; rollback at each stage; slug/email conflicts; sub+entitlements; roles; onboarding; app link+closed.  
**Security:** plan tamper; no platform_admin; CSRF still on HTTP; no password in logs; no partial tenant.  
**Compatibility:** CLI still works; V4 untouched; PA can call same service later.

---

## 21. Duplicate-prevention rules

1. One orchestrator for Free self-serve.  
2. No V4 provision copy.  
3. No second subscription writer.  
4. No parallel “create org” that skips applications for public Free.  
5. Plan key `free` only at assign time (not invent `foundation` plan row until migration).  
6. Do not hardcode limits in four places.

---

## 22. Open owner decisions

1. Auto-suffix slugs vs hard reject?  
2. Existing email: `duplicate_review` vs “sign in to add church”?  
3. Auto-login vs login redirect only?  
4. Create draft pages at provision vs lazy?  
5. Reconcile `max_branches` 2→1 when?  
6. Temporary synthetic hostname vs skipDomain only?

---

## 23. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes / admin screens / dashboard items added  
- No V4 code changed  
