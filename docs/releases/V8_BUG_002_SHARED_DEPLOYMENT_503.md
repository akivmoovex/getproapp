# V8-BUG-002 — Shared V8 deployment HTTP 503

**ID:** V8-BUG-002  
**Priority:** P0  
**Branch:** `V8`  
**Hosts:** `blessboard.neuniversity.org`, `activeclinic.neuniversity.org`  
**Status:** **BLOCKED on Hostinger** — application code ready; Node upstream not serving  
**Recorded:** 2026-09-20

## Root cause

Both V8 hosts return **Hostinger hCDN stock HTTP 503 HTML**. This is an **edge / hosting-layer** failure: DNS and SSL exist, but **no healthy Node.js upstream** is bound to the V8 application.

This is **not** an Express routing bug, shared-database outage, or V7 interference.

### Evidence (2026-09-20)

| Signal | V8 (`*.neuniversity.org`) | V7 (`*.pronline.org`) |
|--------|---------------------------|------------------------|
| HTTP status | **503** | **200** on `/healthz` |
| Body | Stock HTML title `503 Service Unavailable`, text “The server is temporarily busy…” | JSON `{"ok":true,…}` |
| `content-type` | `text/html` (~807 bytes) | `application/json` |
| `platform` / `server` | `hostinger` / `hcdn` | same |
| `x-hcdn-upstream-rt` | **absent** | present (e.g. `0.005`) |
| `x-request-id` | **absent** | present (app request id) |
| DNS A records | Resolve (Hostinger anycast) | Resolve (different IPs) |
| TLS | Let’s Encrypt CN=`blessboard.neuniversity.org` (issued 2026-09-20) | Valid LE for pronline |

Classifier: `src/platform/ops/hostingerUpstreamProbe.js` → `HOSTINGER_EDGE_NO_UPSTREAM`.

Smoke:

```bash
V8_SMOKE_BASE_BB=https://blessboard.neuniversity.org \
V8_SMOKE_BASE_AC=https://activeclinic.neuniversity.org \
npm run test:v8:hosted-smoke
# expected while blocked: exit 3 + ROOT_CAUSE=HOSTINGER_EDGE_NO_UPSTREAM
```

## What is already correct in git

- Profile `moovex-platform-v8-testing` with BB/AC hostname product selection
- Shared DB identity `moovex-platform-v7` / `testing` (no startup migrations)
- Isolation from V7 cookies, media namespace `testing-v8/`, jobs off
- Local V8 = `origin/V8` with automated regression green

## Fix implemented in repo (this bug)

1. Hostinger upstream response classifier + hosted-smoke root-cause exit code **3**
2. Regression tests (`tests/v8-bug002-hostinger-upstream-503.test.js`)
3. Operator runbook updates in [`V8_HOSTINGER_TESTING_ENV.md`](../platform/V8_HOSTINGER_TESTING_ENV.md)

**No application runtime change can clear a Hostinger-edge 503.** Claiming a code-only fix would be incorrect.

## Required manual Hostinger actions

Perform in **hPanel only on the V8 app** (never restart/rebind V7 `*.pronline.org` or production):

1. **Create or open** a dedicated Node.js application (e.g. `moovex-platform-v8-testing`).
2. **Git:** repository `akivmoovex/getproapp`, branch **`V8`**, entrypoint `npm start` → `node index.js`, Node **≥ 20**.
3. **Attach domains** to that app:
   - `blessboard.neuniversity.org`
   - `activeclinic.neuniversity.org`
   - (optional) `neuniversity.org` / `www.neuniversity.org`
4. Confirm domains are **not** attached to the V7 `moovex-platform-testing` worker.
5. Set env (copy secrets from operator vault — do not invent):

```env
NODE_ENV=production
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing
DATABASE_URL=<same V7 testing PostgreSQL URL>
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=testing
SESSION_SECRET=<distinct from V7 testing SESSION_SECRET>
GETPRO_GIT_SHA=<deployed commit>
```

6. Optional media (shared root OK; V8 writes `testing-v8/`):

```env
MEDIA_STORAGE_ROOT=/home/<account>/moovex-media
MEDIA_PUBLIC_BASE_URL=https://blessboard.neuniversity.org/media
MEDIA_PUBLIC_MOUNT_PATH=/media
GETPRO_PG_SSL=no-verify
```

7. **Deploy / Restart** the V8 Node app only.
8. Verify:
   - `https://blessboard.neuniversity.org/healthz` → 200 JSON, `deploymentCode=moovex-platform-v8-testing`, `platformLine=v8`, `gitSha` matches `origin/V8`
   - Same for `activeclinic.neuniversity.org`
   - Homepages 200 with BB/AC branding; no redirect to `*.pronline.org`
   - V7 `/healthz` still 200 with V7 SHA

## Non-goals

- Do not change V7 Hostinger env or restart V7 to “fix” V8
- Do not run migrations from Hostinger startup
- Do not reset the shared database or change DB credentials
- Do not touch production Hostinger profiles

## Pass criteria

`V8_SHARED_DEPLOYMENT_503_PASS` only when both V8 homepages return success and `/healthz` reports the expected V8 SHA. Until then: **`V8_SHARED_DEPLOYMENT_503_BLOCKED`**.
