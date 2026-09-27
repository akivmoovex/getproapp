# V10 DBCL09 — Legacy Server Retirement Proof

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_DBCL09_LEGACY_SERVER_REVIEW` |
| **Date** | 2026-09-27 |
| **Prerequisite** | DBCL08 `DBCL08_SCHEMA_LAG_REVIEW_PASS` |
| **Mode** | **READ/ANALYZE** — no deployment-config mutation; no file deletion |
| **Verdict** | **`KEEP`** · classification **`ACTIVE`** (not `ZERO_CONSUMER`) |

---

## Classification

| Target | Class | Action |
|--------|-------|--------|
| `server.legacy.js` | **ACTIVE** | **KEEP** |
| `src/platform/http/compareLegacyHostContext.js` | **ACTIVE** (sole runtime consumer = `server.legacy.js`) | **KEEP** |

Not `ZERO_CONSUMER`, not `TEST_ONLY`, not `ROLLBACK` alone: current `server.js` bootstrap still invokes the legacy app when no authoritative deployment profile resolves a `runtimeMode`.

---

## Exact consumers (runtime)

### `server.legacy.js`

| Consumer | Kind | Evidence |
|----------|------|----------|
| `server.js` L121–123 | **Bootstrap fallback** | `else if (!runtimeMode) { require("./server.legacy"); }` when profile unresolved / unset |
| `package.json` `dev` script | Nodemon watch | `--watch "server.legacy.js"` |
| `index.js` → `server.js` | Hostinger entry | Panel may start `index.js` / `server.js`; unprofiled env still reaches legacy branch |
| Isolation / presence tests | Test (read-only) | Multiple suites `fs.readFileSync("server.legacy.js")` to assert V4 isolation |

**Not** loaded by authoritative foundation profiles: every registered profile uses `runtimeMode=v5-foundation` or `legacy-redirect` (foundation server path). GetPro codes `getproapp-org-production` / `getpro-pronline-testing` are **profiled** `v5-foundation` — they do **not** use `server.legacy.js`.

### `compareLegacyHostContext.js`

| Consumer | Kind | Evidence |
|----------|------|----------|
| `server.legacy.js` | **Only runtime require** | `createCompareLegacyHostContext({...})` middleware mount |
| `tests/platform-host-comparison.test.js` | Test | Unit suite for comparison helpers |
| `tests/blessboard-catalogue-http-context.test.js` | Test | Catalogue vs platform compare |
| `tests/platform-diagnostic-integration.test.js` | Test | Diagnostic middleware |
| `tests/v5-logging-sensitive-data.test.js` | Test | Logging redaction |
| `tests/v10-dbcl04-canonical-cleanup-baseline.test.js` | Test | Consumer inventory |

`src/platform/http/v5FoundationServer.js` does **not** import compare middleware (DBCL04 §9).

---

## Branch matrix (proven locally)

| Env | `runtimeMode` | `server.js` path |
|-----|---------------|------------------|
| `PLATFORM_DEPLOYMENT_CODE` unset | `null` | **`server.legacy`** (`assertDeploymentProfileOrExit` allows unset) |
| `moovex-platform-testing` + matching identity | `v5-foundation` | foundation |
| `getproapp-org-production` + production | `v5-foundation` | foundation |
| `getpro-pronline-testing` | `v5-foundation` | foundation |
| `blessboard-org-legacy-redirect` | `legacy-redirect` | foundation (redirect runtime) |
| Unknown `PLATFORM_DEPLOYMENT_CODE` | blocked by profile assert | process exit (never reaches legacy) |

Hosted QA/production Moovex apps set authoritative codes → foundation. Legacy remains reachable if Hostinger omits `PLATFORM_DEPLOYMENT_CODE` (documented hazard in `HOSTED_SUPABASE_RUNBOOK.md`).

---

## Package / Hostinger / docs / profiles

| Surface | Finding |
|---------|---------|
| `package.json` scripts | `dev` watches legacy; `start` → `index.js` → `server.js` (conditional legacy) |
| Hostinger startup | Entry is `index.js`/`server.js`; profile env selects foundation vs legacy |
| Deployment profiles | No profile `runtimeMode` points at legacy file; unprofiled = legacy |
| Docs | PL03 ACTIVE_LEGACY; PL01 REMOVE_PRELIVE candidate only if foundation mandatory; AC01 audit documents unprofiled → `server.legacy.js` |

---

## Why not delete now

1. `server.js` still has a live `require("./server.legacy")` path with `compatOk:true` when code unset.  
2. Removing the file would crash any unprofiled worker still allowed by `assertDeploymentProfileOrExit`.  
3. Closing the path requires an intentional product decision to **fail-closed** on missing `PLATFORM_DEPLOYMENT_CODE` (deployment configuration change) — out of scope and not proven safe for this pass.  
4. `compareLegacyHostContext` has no other runtime owner; delete only after legacy server retirement.

---

## Explicit non-actions

- No deletion of `server.legacy.js` or `compareLegacyHostContext.js`
- No Hostinger / profile env changes
- No `server.js` branch rewrite to fail-closed

---

## Required markers

```text
DBCL09_LEGACY_SERVER_REVIEW_PASS

CLASSIFICATION: ACTIVE
ACTION: KEEP
CONSUMER: server.js unprofiled bootstrap (require("./server.legacy"))
COMPARE_LEGACY_HOST_CONTEXT: KEEP (runtime sole consumer = server.legacy.js)
ZERO_CONSUMER: NO
```
