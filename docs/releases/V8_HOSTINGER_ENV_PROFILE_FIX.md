# V8 Hostinger environment profile conflict — root cause and fix

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P0  
**Final status:** `V8_HOSTINGER_ENV_PROFILE_EXTERNAL_BLOCKER`

Code fix is on `origin/V8`. Hosted V8 still returns HTTP **503** (Hostinger edge / workers not yet running the new build). Do not claim hosted PASS until both `/healthz` endpoints return 200 with `moovex-platform-v8-testing`.

## 1. Root cause and evidence

### Confirmed failure

Hostinger workers crash at profile validation with:

```text
FATAL: BASE_DOMAIN="neuniversity.org" conflicts with profile moovex-platform-testing (expected pronline.org). Refusing to start.
```

hPanel for the V8 app shows the intended values:

| Variable | Intended (hPanel) | Observed on worker at `pre_file` |
|----------|-------------------|----------------------------------|
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-v8-testing` | **`moovex-platform-testing`** |
| `BASE_DOMAIN` | `neuniversity.org` | `neuniversity.org` |
| `DEPLOYMENT_ENV` | `testing` | `testing` |
| `DATABASE_IDENTITY_EXPECTED` | `moovex-platform-v7` | (as configured) |

### Source classification

| Hypothesis | Verdict |
|------------|---------|
| A. Hardcoded in application code | **No** — no assignment of `moovex-platform-testing` into `process.env` in startup |
| B. Startup script rewrite | **No** |
| C. Default configuration mapping all testing → V7 | **No** — V8 profile exists and is selected only when code is `moovex-platform-v8-testing` |
| D. Repo `.env` load | **No** in production — bootstrap skips repo `.env` when `NODE_ENV=production` |
| E. Inherited / Hostinger-injected process env | **Yes (primary)** — `envTrace phase=pre_file` runs **before** any dotenv / `.env.production` merge and already shows the stale V7 deployment code |
| F. Other | Secondary risk: early production-file fill from `pronline/.env.production` could fill missing keys on mis-pathed apps (`override:false`); mitigated for V8 `BASE_DOMAIN` |

Startup entry from Hostinger: `startupEntry=/usr/local/lsws/fcgi-bin/lsnode.js`.

**Conclusion:** LiteSpeed/Hostinger supplies a **stale** `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing` into the worker before application bootstrap, while correctly supplying `BASE_DOMAIN=neuniversity.org`. Profile validation fail-closes. This is an environment-propagation conflict, not a missing V8 profile.

## 2. Initialization order

1. LiteSpeed `lsnode.js` starts Node worker (may inject inherited panel env).  
2. `index.js` → `server.js` → `runBootstrap()`.  
3. **`pre_file` snapshot + logs** (Hostinger-inherited values visible here).  
4. **NEW:** `applyV8HostingerStaleDeploymentCodeCompat()` when eligible.  
5. Early production `.env.production` fill (`override: false`) — V8 skips `pronline/` candidates when `BASE_DOMAIN=neuniversity.org`.  
6. `assertDeploymentProfileOrExit()` — must see `moovex-platform-v8-testing`.

## 3. Code / configuration changes

| Change | Role |
|--------|------|
| `src/platform/config/v8HostingerEnvCompat.js` | Narrow remap: stale V7 testing code + exact `BASE_DOMAIN=neuniversity.org` + testing identity → `moovex-platform-v8-testing` |
| `src/startup/bootstrap.js` | Invoke compat after `pre_file` log; prefer `neuniversity` production env-file candidates; skip `pronline/` when V8 base domain |
| `tests/v8-hostinger-env-profile-conflict.test.js` | Regression (fail before / pass after) + security negative cases |
| Docs / suite wiring | This report + coverage targets |

**Not changed:** V7 profile, shared DB identity (`moovex-platform-v7` / `testing`), production profiles, Host header–based profile selection.

## 4. Security safeguards

- Remap only when code is **exactly** `moovex-platform-testing` (not arbitrary codes).  
- Requires **exact** `BASE_DOMAIN=neuniversity.org` (not Host header, not arbitrary domains).  
- Requires testing `DEPLOYMENT_ENV` / identity env (rejects `production`).  
- Does **not** override an already-correct `moovex-platform-v8-testing`.  
- Does **not** invent a code when `PLATFORM_DEPLOYMENT_CODE` is missing.  
- Does **not** remap V7 apps with `BASE_DOMAIN=pronline.org`.  
- Shared DB identity must remain `moovex-platform-v7` when set.

## 5. Automated tests and coverage

| Gate | Result |
|------|--------|
| `tests/v8-hostinger-env-profile-conflict.test.js` | **13/13 pass** (includes fail-before / pass-after regression) |
| `npm run test:v8:regression:coverage` | **PASS** |

| Suite | Tests | Pass | Fail | Skip |
|-------|------:|-----:|-----:|-----:|
| shared-platform | 333 | 333 | 0 | 0 |
| compatibility | 248 | 248 | 0 | 0 |
| blessboard | 241 | 241 | 0 | 0 |
| activeclinic | 104 | 104 | 0 | 0 |

Coverage aggregate: **lines 92.3%**, branches **65.22%** (PASS).  
`v8HostingerEnvCompat.js`: **lines 96.87%**, branches 77.14%.

## 6. V7 compatibility

V7 profile + `BASE_DOMAIN=pronline.org` remains valid and is not remapped. Hosted V7 `/healthz` still **200** (`moovex-platform-testing`, `03a89106e2fe`). Production untouched (`moovex-platform-production`).

## 7–9. Hosted verification (post-fix probe)

| Check | Result |
|-------|--------|
| Hosted V8 SHA | **Unavailable** |
| `blessboard.neuniversity.org/` + `/healthz` | **503** / **503** |
| `activeclinic.neuniversity.org/` + `/healthz` | **503** / **503** |
| About Version 2.0 | **Not verifiable** (503) |

## 10. Remaining external blockers

1. **Deploy/Restart** the V8 Hostinger Node app on branch `V8` so workers load this bootstrap fix.  
2. Confirm hPanel still lists `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing` and `BASE_DOMAIN=neuniversity.org` (compat is a safety net).  
3. Re-check `/healthz` for `deploymentCode=moovex-platform-v8-testing`, `platformLine=v8`, matching git SHA.  
4. If workers still show stale code at `pre_file` **without** `BASE_DOMAIN=neuniversity.org`, fix hPanel inheritance (separate from this code path).
