# BlessBoard V5 — Feature flag and kill-switch audit

**Date:** 2026-07-19  
**Mode:** Operations audit only — **no live configuration changes**, **no new flags implemented**  
**Companions:** [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_CUSTOM_DOMAIN_READINESS.md`](../product/NETWORK_CUSTOM_DOMAIN_READINESS.md) · [`NETWORK_WEBHOOK_DESIGN.md`](../product/NETWORK_WEBHOOK_DESIGN.md) · [`NETWORK_API_ACCESS_DESIGN.md`](../product/NETWORK_API_ACCESS_DESIGN.md) · [`BATCH_FG_SCHEDULED_REPORTS.md`](../gui/BATCH_FG_SCHEDULED_REPORTS.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Can high-risk **routing** be disabled safely today? | **Yes** — mode `off` / `shadow` + clear allow-list; Hostinger restart all workers |
| Can **background jobs** be kept off on V5 foundation? | **Yes** — foundation mode forces jobs off; also set `BLESSBOARD_JOBS_ENABLED=0` |
| Can **webhooks / API / scheduled reports / scheduled communications** be “killed”? | **N/A as runtime delivery** — backends **not shipped** on V5; risk is false UI / future fail-open, not live senders |
| Critical missing kill switch for **operational** V5 today? | **Media uploads** — no dedicated disable flag (authz/CSRF only) |
| Unsafe default to watch? | `BLESSBOARD_JOBS_ENABLED` **unset = enabled** on non-foundation (V4) paths; do not rely on unset when V5 leaves foundation pairing |

**Do not** add per-screen flags. Prefer a few **deployment-scoped** env gates plus existing entitlements.

---

## 2. Legend

| Column | Meaning |
|--------|---------|
| **Control** | Env var, entitlement key, DB flag, or code gate |
| **Default** | Behavior when unset / invalid |
| **Scope** | Process / deployment / organization / host |
| **Runtime change** | Can value change without redeploying code? (Hostinger env still needs worker restart) |
| **Restart needed** | Required for Hostinger / Node workers to observe panel env edits |
| **Rollback** | Fastest safe disable |

| Class | Meaning |
|-------|---------|
| **FAIL-CLOSED** | Unsafe state refuses the risky behavior |
| **FAIL-OPEN** | Unset/invalid enables or allows risk |
| **COSMETIC** | UI/status only; does not stop the risky path |
| **MISSING** | No real kill switch |
| **NOT SHIPPED** | Feature absent — entitlement/docs only |

---

## 3. Master control table (risky features)

| Feature | Control | Default | Scope | Runtime change | Restart needed | Rollback |
|---------|---------|---------|-------|----------------|----------------|----------|
| Tenant routing (master) | `BLESSBOARD_TENANT_ROUTING_MODE` | **`off`** (invalid → `off`) **FAIL-CLOSED** | Process / deployment | Env edit | **Yes** (Hostinger workers) | Set `off`, restart all workers |
| Authoritative routing | Same mode = `authoritative` | Off until set | Process | Env edit | **Yes** | Set `shadow` or `off`, restart |
| Authoritative host pilot | `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | **Empty → foundation only** under authoritative **FAIL-CLOSED** | Process / host | Env edit | **Yes** | Clear allow-list **or** mode `off`/`shadow`; restart |
| Authoritative estate cutover | Allow-list token `*` | Not set | Process / estate | Env edit | **Yes** | Remove `*`; prefer explicit hosts; restart |
| Host-context diagnostics | `PLATFORM_HOST_CONTEXT_MODE` | **`off`** **FAIL-CLOSED** | Process | Env edit | **Yes** | Set `off` (does not route tenants) |
| Background jobs (V5 foundation) | `isV5FoundationMode()` → `areBlessBoardJobsEnabled()` **false** | Always disabled in foundation | Process | Leave foundation pairing | N/A while foundation | Keep `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + `DEPLOYMENT_ENV=testing` |
| Background jobs (env) | `BLESSBOARD_JOBS_ENABLED` | **Unset = enabled** on **non-foundation** **FAIL-OPEN** | Process | Env edit | **Yes** | Set `0`/`false`/`no`/`off`; restart; confirm no cron entrypoints |
| Deployment jobs flag (DB) | `platform.deployments.jobs_enabled` | V5 row **`false`** (architecture) | Deployment row | SQL/ops | App may read at resolve; treat as **display + policy**, not sole kill | Keep `false` for `blessboard-org-v5`; do not flip without jobs design |
| Custom domain **entitlement** | `FEATURE_KEYS.CUSTOM_DOMAIN` / plan + override | Foundation/Growth **false** **FAIL-CLOSED** for insert | Organization | Plan/override (DB) | No code restart | Remove override / downgrade plan; deactivate domain row |
| Custom domain **serve** | Routing mode + allow-list + domain resolve | No tenant HTML until authoritative (+ allow-list) | Host | Env + DNS | **Yes** for env | Mode `off`/`shadow`; remove host from allow-list; deactivate domain |
| Custom domain **DNS/SSL automation** | — | **NOT SHIPPED** | — | — | — | N/A — manual panels only |
| Domain `verified_at` | Column / PA display | Unused by routing | Domain row | DB | No | **COSMETIC** today — do not treat as kill switch |
| API access | Entitlement `api_access` + designs | **false** / **NOT SHIPPED** backend | Org (future) | — | — | Keep entitlement false; no public API routes to kill |
| Webhook delivery | Entitlement `webhooks` + designs | **false** / **NOT SHIPPED** | Org (future) | — | — | Keep entitlement false; jobs already off |
| External integrations | Entitlement `integrations` | **false** / **NOT SHIPPED** | Org (future) | — | — | Keep false |
| Scheduled reports (V5) | Jobs + product gate | **NOT SHIPPED** (DEFERRED / MISSING_BACKEND) | — | — | — | Do not enable jobs; do not ship schedule GUI that pretends success |
| Scheduled communications / broadcasts (V5) | Jobs + V4 church paths | **NOT SHIPPED** on V5 foundation | — | — | — | Same — jobs off; no V5 outbox |
| Media upload | Authz + CSRF + validation; storage via Supabase/local | **Uploads enabled** when routes mounted **MISSING** global kill | Process / org (authz) | Env for storage only | **Yes** if changing storage env | Revoke staff roles; remove Supabase creds / force local; **no** `UPLOADS=0` today |
| Media storage backend | `BLESSBOARD_MEDIA_STORAGE=local` / `BLESSBOARD_MEDIA_FORCE_LOCAL=1` / unset Supabase keys | Local if no Supabase creds | Process | Env edit | **Yes** | Force local or unset service role — stops **remote** store, not upload API |
| Package entitlements (general) | `platform.plan_features` + soft resolve | Premium writes **FAIL-CLOSED** via `assertFeature` | Organization | Plan/override | No | PA override revoke; plan reassignment |
| Network-only HQ chrome | Entitlement soft flags in shell locals | Hidden when false | Org / session | Plan change | No | Downgrade plan — **nav hide only** where backend missing |
| Registration rate limit | `BLESSBOARD_REGISTER_RATE_LIMIT` | Code default when unset | Process | Env edit | **Yes** | Lower limit / rely on CSRF — not a feature kill |
| Session / CSRF | `SESSION_SECRET`, cookie name | Required in production | Process | Env edit | **Yes** | Rotate secret (session wipe) — incident control, not feature flag |

---

## 4. High-risk disable verification

| Feature | Can disable safely today? | How | Notes |
|---------|---------------------------|-----|-------|
| **Authoritative tenant routing** | **Yes** | `BLESSBOARD_TENANT_ROUTING_MODE=off` or `shadow`; clear allow-list; **restart all workers** | Empty allow-list alone under `authoritative` already fail-closes to foundation |
| **Custom domains (serve)** | **Yes** (serve path) | Same routing rollback; deactivate `platform.domains` row; remove from allow-list | Entitlement blocks **new** custom inserts; existing row + authoritative + allow-list still serves |
| **Background jobs** | **Yes** on foundation | Foundation forces off; set `BLESSBOARD_JOBS_ENABLED=0` | Confirm no separate Hostinger cron hitting V4 scripts against V5 DB |
| **Webhook delivery** | **N/A** | Not implemented | When built: need delivery master switch default **off** + entitlement |
| **Scheduled reports** | **N/A** | Not implemented on V5 | Do not enable jobs as a shortcut |
| **Scheduled communications** | **N/A** | Not on V5 foundation | V4 Growth broadcast paths must not be pointed at V5 DB |
| **API clients** | **N/A** | Not implemented | Keep `api_access` false |
| **External integrations** | **N/A** | Not implemented | Keep `integrations` false |
| **Media upload** | **Partial** | Role revoke; remove storage credentials; incident: block paths at reverse proxy | **No** first-class env kill switch |

---

## 5. Findings by category

### 5.1 Missing kill switches

| Gap | Risk | Severity |
|-----|------|----------|
| No `BLESSBOARD_MEDIA_UPLOADS_ENABLED` (or equivalent) | Cannot instantly stop all HQ/BA uploads without role surgery or proxy rules | **HIGH** (ops) |
| No global `BLESSBOARD_API_ENABLED` / webhook delivery switch | Acceptable while **NOT SHIPPED**; critical before any outbox ships | **MEDIUM** (future) |
| No explicit “custom domain resolve” env beyond routing/allow-list | Partially covered by allow-list + mode; domain row deactivate is DB ops | **LOW** |
| Jobs fail-open when unset outside foundation | If V5 ever runs **without** foundation pairing, unset enables jobs | **HIGH** (future / mis-pair) |

### 5.2 Unsafe defaults

| Control | Issue |
|---------|--------|
| `BLESSBOARD_JOBS_ENABLED` unset | **FAIL-OPEN** on non-foundation (V4-compatible) |
| Unsupported jobs token | Treated enabled (V4 parse) |
| Allow-list `*` | Intentional estate allow-all — **high blast radius** if mode left `authoritative` |

Routing mode and empty allow-list defaults are **safe**.

### 5.3 Cosmetic / non-enforcing controls

| Control | Why cosmetic |
|---------|----------------|
| PA deployment `jobs_enabled` display | Informative; real disable is foundation + env + not starting workers |
| Domain `verified_at` | Not consulted by tenant routing |
| Network HQ links for API / webhooks / mailboxes (where present) | Catalogue/entitlement chrome without delivery backends ([`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md)) |
| Soft entitlement flags for unshipped Network capabilities | Hide/show UI; no outbound worker to stop |

### 5.4 Fail-open controls

| Control | Behavior |
|---------|----------|
| `BLESSBOARD_JOBS_ENABLED` unset (non-foundation) | Jobs **on** |
| Media upload routes | **On** whenever app is up and user authorized |
| Entitlement soft-read paths | Public/soft reads may degrade gracefully — premium **writes** are fail-closed |

### 5.5 Fail-closed controls (good)

| Control | Behavior |
|---------|----------|
| Unset/invalid routing mode | `off` |
| Authoritative + empty allow-list | Foundation only |
| Deployment mismatch | No tenant serve |
| `assertFeature(CUSTOM_DOMAIN)` on custom insert | Forbidden without Network |
| Network FEATURE_KEYS default false on lower plans | Premium capabilities off |
| V5 foundation mode | Jobs workers not started |

### 5.6 Restart required

| Change | Restart |
|--------|---------|
| Any Hostinger panel env (`BLESSBOARD_*`, allow-list, jobs, media, secrets) | **Yes — all workers** |
| Plan / entitlement override in DB | **No** (next request resolves) |
| Domain row status / deactivate | **No** (resolve on request) |
| Code deploy | **Yes** |

Routing/allow-list helpers **read `process.env` when invoked**, but Hostinger does not mutate a running process’s env without restart — treat all env flips as **restart-gated**.

---

## 6. Package entitlements vs kill switches

| Mechanism | Role |
|-----------|------|
| Plan features / overrides | **Commercial and org-scoped** capability gates |
| Env routing / jobs / (future) delivery flags | **Deployment-scoped** incident and pilot controls |

Do **not** replace env kill switches with “downgrade every org’s plan” during an incident. Prefer env + restart for blast-radius control; use entitlements for package honesty.

---

## 7. Smallest recommended additions (do **not** implement in this task)

Ordered by ops value; avoid per-screen flags.

| # | Addition | Default | Fail | Why |
|---|----------|---------|------|-----|
| 1 | `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | `1` on testing if uploads required today; prefer document Hostinger as `1` with ability to set **`0`** | **`0` → reject upload POSTs** (read/list/archive policy TBD) | Only high-risk **shipped** write path without a master switch |
| 2 | Ops rule (doc + checklist): production-bound V5 **must** set `BLESSBOARD_JOBS_ENABLED=0` even if foundation pairing changes | Explicit `0` | — | Closes fail-open unset when foundation gate lifts |
| 3 | When webhook outbox ships: `BLESSBOARD_WEBHOOK_DELIVERY_ENABLED` default **`0`** | Off | Fail-closed | Delivery blast radius |
| 4 | When public API ships: `BLESSBOARD_API_HTTP_ENABLED` default **`0`** | Off | Fail-closed | Independent of per-org `api_access` |
| 5 | Optional: refuse `*` allow-list unless `BLESSBOARD_AUTHORITATIVE_ALLOW_ESTATE=1` | Unset rejects `*` | Fail-closed | Prevents accidental estate cutover |

**Explicitly not recommended:** flags per HQ report screen, per nav item, or duplicate entitlements as env vars.

---

## 8. Operator rollback cheat-sheet (no values that are secrets)

```text
# Routing incident
BLESSBOARD_TENANT_ROUTING_MODE=off
# optional: clear BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST
# restart ALL workers
# verify /healthz and apex /login

# Jobs
BLESSBOARD_JOBS_ENABLED=0
# restart; confirm no external cron

# Media (today — until flag exists)
# revoke uploader roles OR unset Supabase service role / force local
# optional: edge deny POST …/media/upload

# Custom domain blast
# remove host from allow-list OR mode=off; deactivate domain row
```

---

## 9. Report summary

### Critical missing controls

1. ~~**Media upload master kill switch**~~ — **IMPLEMENTED** (`BLESSBOARD_MEDIA_UPLOADS_ENABLED`, default off).  
2. ~~**Jobs fail-open when unset** outside V5 foundation~~ — **IMPLEMENTED** for `blessboard-org-v5` (unset/invalid → disabled); V4 unset remains enabled.  
3. **Future** API/webhook delivery switches — not blocking today because **NOT SHIPPED**, but mandatory before enablement.

### Implementation note (2026-07-19)

See `src/blessboard/config/mediaUploadsEnabled.js`, `parseBlessBoardJobsEnabled` in `v5EnvValidation.js`, route/service enforcement on media upload, startup logs (presence/state only). **Do not** set enable flags on Hostinger from documentation alone.

### Next batch

1. Product/ops accept §7 item **1** (media uploads enable flag) + document Hostinger expected value.  
2. Add release-checklist row: jobs explicit `0` for any non-foundation or production-bound V5.  
3. Defer API/webhook env flags until those backends are approved to implement.  
4. **Do not** implement flags in the same batch as this audit unless Leadership prioritizes media kill switch as a hotfix.

---

## Suggested documentation commit message

```
docs(operations): audit V5 feature flags and kill switches

Map routing, jobs, domains, entitlements, and unshipped Network
delivery paths; recommend minimal media/jobs/API additions without implementing.
```
