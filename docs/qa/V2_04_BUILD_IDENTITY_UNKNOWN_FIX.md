# V2.04 Build Identity — Hostinger Shared Metadata (RB-ID-01)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BUILD_IDENTITY_UNKNOWN_FIX` |
| **VERSION** | **2.04** |
| **Date** | 2026-10-02 |
| **Finish** | **`V2_04_SHARED_BUILD_IDENTITY_FIXED`** |

---

## Hostinger constraint (authoritative)

**Subdomains do NOT have their own environment-variable configuration.**  
`GETPRO_GIT_BRANCH=V4` exists on the **apex** `neuniversity.org` Hostinger Node app only.

LiteSpeed / Hostinger spawns **one sticky lsnode worker per hostname** against the **same** hbuild release tree:

| Host | Worker | Sees `GETPRO_GIT_BRANCH`? |
|------|--------|---------------------------|
| `neuniversity.org` (apex) | separate PID | **yes** (hPanel env) |
| `blessboard.neuniversity.org` | separate PID | **no** |
| `activeclinic.neuniversity.org` | separate PID | **no** |
| `www.neuniversity.org` | separate PID | typically no |

Same SHA · same `moovex-platform-v8-testing` · shared filesystem · **not** shared `process.env`.

Do **not** require impossible per-subdomain env configuration.

## Root cause

1. Branch identity was resolved primarily from **per-process env** (+ detached-HEAD git fallback → null).  
2. Apex worker correctly showed `V4 testing` via `GETPRO_GIT_BRANCH`.  
3. BB/AC workers lacked that env → `UNKNOWN testing` despite identical deploy SHA.  
4. Prior “restart BB+AC apps” guidance assumed Topology B per-app env — **incorrect for this Hostinger model**.

## Fix (minimal shared)

**Shared deployment metadata file** (filesystem, one per deployed application version):

`<appRoot>/.getpro/build-identity.json`

Authority order:

1. explicit `GETPRO_GIT_BRANCH` if present (live process.env)  
2. other explicit env branch keys  
3. shared `.getpro/build-identity.json` (SHA-matched)  
4. git branch if genuinely available (attached HEAD)  
5. `UNKNOWN` only if no authoritative source exists

Apex (or any worker with env) **seeds** the file on bootstrap / first identity resolve. BB/AC **read** the same file. No hardcoded `V4`. No hostname inference. No SHA→branch invention. Same shared resolver for hub / BB / AC.

## Operator checklist (TESTING)

1. Keep **`GETPRO_GIT_BRANCH=V4`** on the **apex** Hostinger app (`neuniversity.org`) only — that is enough.  
2. Redeploy / restart the testing app so the new shared-metadata code lands and apex seeds `.getpro/build-identity.json`.  
3. Confirm `/healthz` on apex / BB / AC: `branch=V4`, `displayLabel=V4 testing`.  
   - Apex `branchSource=GETPRO_GIT_BRANCH`  
   - BB/AC `branchSource=shared.build-identity`  
4. Confirm About pages show **V4 testing** (not UNKNOWN).  
5. Do **not** change production workers for this testing fix.

## Focused evidence

`node --test tests/v2-04-build-identity-git-branch.test.js` → **10/10 PASS**  
(also regression `tests/platform-build-identity.test.js` → 10/10 PASS)

Live hosted BB/AC remain UNKNOWN until this code is deployed to Hostinger.

### Post-deploy verify (2026-10-02) — candidate `33e5c296…`

| Host | SHA | BRANCH | BRANCH_SOURCE | LABEL |
|------|-----|--------|---------------|-------|
| Hub | `554d37406ef5` | V4 | GETPRO_GIT_BRANCH | V4 testing |
| AC | `554d37406ef5` | UNKNOWN | unknown | UNKNOWN testing |
| BB | `554d37406ef5` | UNKNOWN | unknown | UNKNOWN testing |

**RB-ID-01=FAIL** on hosted: shared-metadata tip + C01 candidate not live (`33e5c296…` ≠ `554d37406ef5`). Resolution chain expected after deploy: env → `.getpro/build-identity.json` → git → UNKNOWN.

---

```
HOSTINGER_SUBDOMAIN_ENV_SUPPORTED=NO
ROOT_CAUSE=Per-hostname lsnode workers share hbuild tree but only apex gets GETPRO_GIT_BRANCH
SHARED_BUILD_IDENTITY_SOURCE=.getpro/build-identity.json
FOCUSED_TESTS=10/10
FINAL=V2_04_SHARED_BUILD_IDENTITY_FIXED
```
