# V2.04 Neuniversity Hostinger Runtime + Process Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_NEUNIVERSITY_RUNTIME_RESOURCE_AUDIT` |
| **Mode** | **READ-ONLY** — no code, Hostinger config, restart, or deploy changes |
| **Date** | 2026-10-02 |
| **Deployment** | `moovex-platform-v8-testing` |
| **Deployed gitSha (live)** | `ad76b4b777db` |
| **Release tree (runtime)** | `/home/u549637099/domains/neuniversity.org/hbuilds/versions/01a0f99a-94cc-70ea-a465-37262b0253c6/nodejs` |
| **Evidence** | Live `/__platform/runtime` + `/healthz` probes; Hostinger log fields cited in request (`pid`/`ppid`/`startupEntry`/`pool max`); code + prior V2.01 Hostinger audits |

---

## A. BB registration session failure

### Observed signal

```
event=church_registration_session
operation=establish_session
outcome=fail
failureCategory=transaction_error
```

Church provisioning already committed (`church_registration_transaction` / provision success). Subsequent normal `/login` succeeds: roles → session → cookie → `/hq`.

### Code producing the log

`src/blessboard/http/apexMarketingRoutes.js` → `logSessionEstablishFailure` after post-commit:

```1104:1149:src/blessboard/http/apexMarketingRoutes.js
      // Provisioning committed — establish session (never roll back the tenant).
      // Issue a new opaque V5 session token (replaces any prior cookie value).
      ...
        const sessionResult = await establishSession(getPool(), {
          userId: records.administratorUserId,
          deploymentCode,
          organizationId: records.organizationId,
          churchId: records.churchId,
          branchId: records.branchId,
          ip: clientIp(req),
          userAgent: (req.get && req.get("user-agent")) || null,
        });
        if (sessionResult.ok && sessionResult.rawToken) {
          await issueAuthenticatedSessionCookie(...);
          ...
        } else {
          logSessionEstablishFailure(req, sessionResult && sessionResult.status, ...);
        }
```

`failureCategory` is set from `sessionResult.status` (or a thrown message). Shared implementer: `establishBlessBoardSession` (`src/blessboard/services/establishBlessBoardSession.js`).

### ROOT_CAUSE

**Post-commit auto-login calls `establishBlessBoardSession`, which returns `status=transaction_error`.** That status is a **catch-all / remap**, not a specific Postgres classification:

1. **Empty `catch`** in `establishBlessBoardSession` returns `{ status: "transaction_error", message: "transaction_error" }` and **discards** the underlying exception (no PG `code` / `constraint` / stack in the registration event).
2. **Any `createV5Session` `!ok`** is also remapped to `TRANSACTION_ERROR` (real codes such as `deployment_not_found`, `inactive_deployment`, etc. are only kept in `message`, which registration **does not log** — only `status`).

So Hostinger’s `failureCategory=transaction_error` proves the auto-login call failed inside the shared session TX helper; it **does not** identify the underlying PG/constraint/query fault.

**Ruled out by successful `/login` after the same provision:** missing administrator identity, missing catalogue roles, broken session store, wrong deployment identity for cookie issue, or provisioning rollback.

**Path difference that remains the only registration-specific risk surface:** registration **forces** `organizationId` / `churchId` / `branchId` into `establishBlessBoardSession` (and `organizationId` also becomes `requireOrganizationId`). Login does **not** force those IDs; it derives tenant context from catalogue preferred role after password verification.

### Report fields

| Field | Value |
|-------|--------|
| **ROOT_CAUSE** | `establishBlessBoardSession` failed post-commit with opaque `transaction_error` (swallowed throw and/or remapped `createV5Session` failure). Registration logs `status` only, so the underlying fault is not present in the cited Hostinger event. Not a provision rollback; not missing identity/roles (login proves them). |
| **REGISTRATION_SESSION_PATH** | `POST /register-church` → provision commit → `establishBlessBoardSession(pool, { userId, deploymentCode, organizationId, churchId, branchId, … })` → `issueAuthenticatedSessionCookie` → `303 /hq` (even if session failed: `session_failed_post_commit` on redirect trace) |
| **NORMAL_LOGIN_SESSION_PATH** | `POST /login` → `authenticateBlessBoardUser` (password) → `establishBlessBoardSession(pool, { userId, deploymentCode, requireOrganizationId? })` **without** forced church/branch → `issueAuthenticatedSessionCookie` → `303 /hq` |
| **DIFFERENCE** | Registration trusts provision records and **injects org/church/branch** (also scopes role load via `requireOrganizationId`). Login verifies password then **loads catalogue roles** and prefers session role; tenant IDs come from that role unless an auth-transfer `requireOrganizationId` is set. |
| **USER_IDENTITY_AVAILABLE_AFTER_PROVISION** | **YES** — `records.administratorUserId` present; `/login` finds active user |
| **ROLE_CONTEXT_AVAILABLE** | **YES** — `/login` logs roles loaded (`apex_login_roles_loaded`) and reaches `/hq` |
| **TENANT_CONTEXT_AVAILABLE** | **YES** — provision committed org/church/branch; login session scoped to catalogue preferred tenant |
| **SESSION_STORE_ERROR** | **NOT_PROVEN** — store works on `/login` (`platform.deployment_sessions` insert + cookie). Registration failure may still be insert/TX throw inside the same helper, but logs do not expose store-level PG metadata |
| **MINIMUM_FIX_REQUIRED** | (1) Align registration auto-login args with login: `userId` + `deploymentCode` + `requireOrganizationId=organizationId` only; let preferred catalogue role supply church/branch. (2) Stop remapping `createV5Session` failures to bare `transaction_error`; log `message` / create code / PG fields in `logSessionEstablishFailure`. (3) Replace empty `catch` with logged safe diagnostics. **Do not implement in this audit.** |

---

## B. Hostinger Node process audit

### Live observed workers (2026-10-02 probes)

| Host | PID | Sticky (5 hits) | gitSha | cwd tree |
|------|-----|-----------------|--------|----------|
| `blessboard.neuniversity.org` | **142894** | yes | `ad76b4b777db` | `…/neuniversity.org/hbuilds/versions/01a0f99a-…/nodejs` |
| `activeclinic.neuniversity.org` | **143257** | yes | same | same |
| `neuniversity.org` | **1246145** | yes | same | same |
| `www.neuniversity.org` | **1248902** | yes | same | same |

Request log fields (`ppid=3894280`, `startupEntry=/usr/local/lsws/fcgi-bin/lsnode.js`, listen port 3000) match bootstrap/`workerEnvTrace` / LiteSpeed `lsnode` entry (`src/startup/bootstrap.js`, `src/startup/workerEnvTrace.js`). Runtime JSON does not expose `ppid`; same parent + `lsnode` is consistent with LiteSpeed supervising multiple app workers.

`startedAt` values are within ~2s of each other → concurrent warm after deploy/traffic, **not** a rolling replace of one hostname.

### Classification of pid 142894 + 143257

| Label | Verdict |
|-------|---------|
| **NORMAL_LITESPEED_WORKER_POOL** | **YES** — Hostinger/LiteSpeed **one sticky Node PID per hostname** for the shared release tree (confirmed again; matches `V2_01_HOSTINGER_PROCESS_AUDIT`) |
| **GRACEFUL_RESTART_OVERLAP** | **NO** — PIDs sticky across repeated probes; not old+new for the same host |
| **DUPLICATE_APPLICATION_PROCESSES** | **NO** for same hostname; **YES in the sense of multiple OS processes for one app tree** (expected Hostinger topology, not accidental double-listen on one vhost) |
| **UNKNOWN** | N/A — pattern is known |

### Report fields

| Field | Value |
|-------|--------|
| **EXPECTED_WORKER_COUNT** | **4** for current V8 testing apex set (`bb` + `ac` + apex + `www`) under observed Hostinger per-hostname spawn |
| **OBSERVED_WORKER_COUNT** | **4** (cited pair are 2 of 4) |
| **WHY_MULTIPLE_WORKERS_EXIST** | LiteSpeed `lsnode` / Hostinger Node Web App spawn **per hostname**; shared hbuild tree ≠ shared OS process. App code does **not** `fork`/`cluster` HTTP workers. |
| **SAFE_TO_REDUCE** | **NO** (do not kill PIDs / change panel without Hostinger-supported topology proof) |
| **ESTIMATED_RISK_IF_REDUCED** | **HIGH** — cold starts, 503s, broken product host if a hostname’s only worker is stopped; prior consolidation plan could not prove multi-host → one PID |

---

## C. PostgreSQL pool audit

### Runtime log pair (`max=10` then `max=5`)

Verified in `src/db/pg/pool.js` (single construction path for the HTTP app):

| Log | Source | Default if `GETPRO_PG_POOL_MAX` unset |
|-----|--------|----------------------------------------|
| `PostgreSQL … pool max=10` | `logPgStartupDiagnostics()` | **10** (diagnostic line only) |
| `PostgreSQL pool: max=5` | `getPgPool()` after `getPoolRuntimeConfig()` | **5** (**actual** `new Pool({ max })`) |

This is **one pool**, not two. Docs/default mismatch on the first log line.

### Application pool constructions (HTTP worker)

| POOL_NAME | MODULE | MAX_CONNECTIONS | CREATED_PER_PROCESS | SAME_INSTANCE_AS_OTHER_POOL | PURPOSE |
|-----------|--------|-----------------|---------------------|-----------------------------|---------|
| `getPgPool` singleton | `src/db/pg/pool.js` | `GETPRO_PG_POOL_MAX` or **5** | **YES** | N/A (only app pool) | All HTTP / session / provision queries |

No second `pg.Pool` in the Moovex platform HTTP boot path (`moovexPlatformRuntimeServer` uses `getPgPool` only). Scripts/tests/CLIs construct **separate** short-lived pools when run as separate OS processes — **not** enabled as in-process workers on neuniversity (`jobsEnabled: false`).

### Totals

| Metric | Value |
|--------|--------|
| **NUMBER_OF_DISTINCT_POOLS_PER_WORKER** | **1** |
| **MAX_CONNECTIONS_PER_WORKER** | **5** (actual; ignore misleading `max=10` diagnostic) |
| **MAX_CONNECTIONS_WITH_CURRENT_WORKER_COUNT** | **5 × 4 = 20** potential clients to Supabase from V8 neuniversity hostnames alone |

**Consolidation opportunity (not implementing):** fix diagnostic default to print `getPoolRuntimeConfig().max` so ops stop chasing a false dual-pool; optionally set `GETPRO_PG_POOL_MAX` explicitly. No duplicate in-process pools to merge.

---

## D. Background processes

| PROCESS_OR_JOB | ENABLED_ON_NEUNIVERSITY | SEPARATE_PROCESS | NECESSARY | CAN_DISABLE_OR_CONSOLIDATE |
|----------------|-------------------------|------------------|-----------|----------------------------|
| HTTP Node (`lsnode` → `server.js` → Moovex platform runtime) | **YES** (4 hostnames) | Per hostname | **YES** | Only via Hostinger hostname/topology change — not app toggle |
| Profile scheduled jobs (`jobsEnabled`) | **NO** (`false` on `moovex-platform-v8-testing`; `/healthz` confirms) | N/A | N/A | Already off |
| BlessBoard cron scripts (`scripts/run-blessboard-scheduled-messages.js`, growth expiry, etc.) | **NO** in-process; gate `areBlessBoardJobsEnabled` / profile | Would be separate cron if scheduled | Ops-only | Keep disabled on testing |
| Queue / notification workers | **None** found as long-lived Node children | — | — | — |
| Background polling loops (server) | **None** material in HTTP server path | — | — | — |
| `child_process` / `fork` / `cluster` HTTP workers | **None** in server path | — | — | — |
| Duplicate Node listeners on one host | **Not observed** (one sticky PID per hostname, port 3000) | — | — | — |

---

## E. Hostinger resource saving options (verified only)

### HIGH

| ITEM | CURRENT_COST | SAFE_CHANGE | EXPECTED_SAVING | RISK |
|------|--------------|-------------|-----------------|------|
| Account-wide extra Node apps / unused hostnames outside this audit’s kill list | Prior audits: many PIDs across `pronline.org` + production trees count toward NPROC 200 | Retire/unbind **unused** testing hostnames after PID matrix (ops) | Large NPROC + DB connection headroom | Medium if a hostname still needed |

### MEDIUM

| ITEM | CURRENT_COST | SAFE_CHANGE | EXPECTED_SAVING | RISK |
|------|--------------|-------------|-----------------|------|
| `www.neuniversity.org` as fourth warm worker | +1 Node PID + up to +5 DB clients | If Hub redirect-only and Hostinger can avoid a dedicated worker (unverified) | ~1 process + ≤5 DB conns | Medium — cold start / 503 on www if unbound wrongly |
| Pool diagnostic vs actual max | Confusion / over-provision fear | Align log default to 5; optionally lower `GETPRO_PG_POOL_MAX` after measuring | Clarity; possible lower Supabase pressure | Low–medium if max set too low under concurrency |

### LOW

| ITEM | CURRENT_COST | SAFE_CHANGE | EXPECTED_SAVING | RISK |
|------|--------------|-------------|-----------------|------|
| In-process background jobs on V8 testing | Already **0** | None needed | None | None |
| Fixing BB session logging / auto-login path | Failed auto-login UX (extra `/login`) | Code fix in a later change window | No Hostinger process saving | Low (correctness) |

**Do not recommend reducing LiteSpeed workers for BB/AC/apex** without evidence they are redundant for the same hostname — live evidence shows they are the **expected** per-hostname pool.

---

## Evidence notes

- SSH/hPanel stderr dump **not available** in this environment; process facts re-verified via public testing `/__platform/runtime`.
- Cited `ppid=3894280` / `startupEntry=…/lsnode.js` / dual `pool max` lines match code-emitted Hostinger stdout patterns.
- Prior detailed topology: `docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md`, `docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`.

---

## FINAL

```
BB_SESSION_ERROR_ROOT_CAUSE=opaque_transaction_error_in_establishBlessBoardSession_post_commit_forced_tenant_ids_vs_login_derived_roles_underlying_swallowed
OBSERVED_NODE_WORKERS=4
EXPECTED_NODE_WORKERS=4
DISTINCT_DB_POOLS_PER_WORKER=1
MAX_DB_CONNECTIONS_PER_WORKER=5
BACKGROUND_WORKERS_ENABLED=0
REDUNDANT_PROCESSES_FOUND=0
SAFE_RESOURCE_SAVINGS_FOUND=2
HOSTINGER_PROCESS_REDUCTION_RECOMMENDED=NO
FINAL=NEUNIVERSITY_RUNTIME_RESOURCE_AUDIT_COMPLETE
```
