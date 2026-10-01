# V2.04 Build Identity — UNKNOWN until Hostinger Redeploy

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BUILD_IDENTITY_UNKNOWN_FIX` |
| **VERSION** | **2.04** |
| **Date** | 2026-10-02 |
| **Finish** | **`V2_04_BUILD_IDENTITY_UNKNOWN_FIX_COMPLETE`** |

---

## Symptom

BlessBoard + ActiveClinic About / healthz showed **`UNKNOWN testing`** while hub could show **`V4 testing`**, even when operators believed `GETPRO_GIT_BRANCH=V4` was configured in Hostinger. After Hostinger **redeploy/restart**, product hosts showed **`V4 testing`**.

## Root cause

1. Shared resolver `src/platform/runtime/buildIdentity.js` is correct and shared by BB + AC (About, brand subtitle, platform `/healthz`).
2. Hostinger release trees are often **detached HEAD** → git branch fallback returns null → **`UNKNOWN`** when env metadata is absent from the **running** worker.
3. Hostinger injects hPanel environment variables **at worker process start only**. Setting `GETPRO_GIT_BRANCH=V4` in the panel does **not** update an already-running Node process. Redeploy/restart is required.
4. Topology B (separate Hostinger apps per hostname) can leave hub with the env set and BB/AC workers without it until each app is restarted with the var present.

**Not** a product-specific duplicate label path. **Not** hard-coded V4. Production label path unchanged (`V4 production` when env set; production brand subtitle remains null).

## Code hardening (this fix)

| Change | Purpose |
|--------|---------|
| Live `process.env.GETPRO_GIT_BRANCH` is authoritative when present (wins over stale `opts.env` snapshots) | Prevent false UNKNOWN from closed-over env copies |
| Platform `/healthz` resolves identity via live `process.env`; exposes `branchSource` | Operator-visible source; same resolver as About |
| Worker env trace tracks `GETPRO_GIT_BRANCH` / `GETPRO_GIT_SHA` presence | Startup diagnostics |
| Focused tests `tests/v2-04-build-identity-git-branch.test.js` | V4 testing, git fallback, UNKNOWN, BB=AC, production unchanged |

## Operator checklist (TESTING)

1. Set **`GETPRO_GIT_BRANCH=V4`** on **every** testing Hostinger Node app that serves hub / BlessBoard / ActiveClinic.  
2. **Restart or redeploy** those workers (env change alone is not enough for a running process).  
3. Confirm `/healthz` on BB + AC: `branch=V4`, `displayLabel=V4 testing`, `branchSource=GETPRO_GIT_BRANCH`.  
4. Confirm About pages show **V4 testing** (not UNKNOWN).  
5. Do **not** change production workers for this testing fix.

## Focused evidence

`node --test tests/v2-04-build-identity-git-branch.test.js` → **6/6 PASS**  
(also regression `tests/platform-build-identity.test.js` → 10/10 PASS)

---

```
ROOT_CAUSE=Hostinger env injected at worker start only; detached HEAD → UNKNOWN without live GETPRO_GIT_BRANCH
SHARED_RESOLVER=PASS
BB_BRANCH_LABEL=V4 testing
AC_BRANCH_LABEL=V4 testing
FOCUSED_TESTS=6/6
HOSTINGER_RESTART_REQUIRED_FOR_ENV_CHANGE=YES
FINAL=V2_04_BUILD_IDENTITY_UNKNOWN_FIX_COMPLETE
```
