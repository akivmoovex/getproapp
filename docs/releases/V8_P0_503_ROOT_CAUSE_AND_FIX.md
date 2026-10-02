# V8 P0 — Persistent HTTP 503 root cause and fix

**Recorded:** 2026-09-20T16:35:00Z (approx.)  
**Branch:** `V8`  
**Priority:** P0 deployment blocker  
**Final status:** `V8_P0_503_ROOT_CAUSE_IDENTIFIED_HOSTING_ACTION_REQUIRED`

This report does **not** claim hosted PASS. Both `*.neuniversity.org` homepages still return HTTP **503**.

---

## 1. Exact root cause and evidence

### Confirmed (public HTTP evidence)

**Root cause class: Hostinger edge has no healthy Node.js upstream for the V8 domains**  
(`HOSTINGER_EDGE_NO_UPSTREAM` — maps to diagnostic classes **A and/or D** below).

| Signal | V8 `*.neuniversity.org` | Working V7 `*.pronline.org` |
|--------|-------------------------|-----------------------------|
| HTTP status (home + `/healthz`) | **503** | **200** |
| Body | Stock HTML title `503 Service Unavailable`, text “The server is temporarily busy, try again later!” (~807 bytes) | Application JSON / HTML |
| `content-type` | `text/html` | `application/json` on `/healthz` |
| `platform` / `server` / `panel` | `hostinger` / `hcdn` / `hpanel` | same |
| `x-hcdn-upstream-rt` | **Absent** | Present (e.g. `0.005`) |
| `x-request-id` | **Absent** | Present (app request id) |
| Browser | Title “503 Service Unavailable” | N/A |

Classifier: `src/platform/ops/hostingerUpstreamProbe.js`  
Operator probe: `npm run test:v8:diagnose-503` → exit **3**.

DNS resolves; TLS certificates are valid (Let’s Encrypt, issued **2026-09-20** for both V8 hostnames). Domains reach Hostinger hCDN, but **no Node upstream markers** appear.

### Not confirmed (Hostinger access blocked from Cursor)

The following **cannot** be confirmed or ruled out without hPanel / SSH / Hostinger API:

| Code | Hypothesis | Status |
|------|------------|--------|
| **A** | Hostinger cannot start the Node.js application | **Plausible** — consistent with edge 503; **logs unavailable** |
| **B** | Node starts then crashes | **Unknown** — no stdout/stderr from Hostinger |
| **C** | Node runs but wrong listen port | **Unknown** |
| **D** | Reverse proxy cannot reach Node | **Consistent** with missing `x-hcdn-upstream-rt` |
| **E** | Env misconfiguration aborts boot | **Unlikely as hosted cause** — see local boot (below); still possible on Hostinger if env unset |
| **F** | Database init failure | **Unlikely as hosted cause** — local V8 boot verified shared DB |
| **G** | Hostname routing wrong | **Not reachable** — app never answers |
| **H** | Other | **Unknown** |

**Not confirmed as application-code defect:** local V8 process with `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing` against the **same shared testing database identity** started successfully and returned `/healthz` **200** with `platformLine=v8`, `deploymentCode=moovex-platform-v8-testing`, `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing` (secrets redacted; see §2).

A successful `git push` to `origin/V8` is **not** proof of Hostinger deployment.

---

## 2. Relevant error / diagnostic logs (redacted)

### Hostinger deployment / Node logs

**Unavailable from this environment.**

Blocked checks (Step 1–2 of the prompt):

- Actual Hostinger application name serving each V8 domain  
- Deployment source / branch / deployed commit in hPanel  
- Application root / Node version on the server  
- Whether the process is running, stopped, crashing, or restarting  
- Hostinger build logs, Node stdout/stderr, restart history  

No SSH private keys for Hostinger, no `hpanel`/`hostinger` CLI, no Hostinger MCP, no deploy automation credentials in the agent environment.

### Public edge response (timestamp from response headers)

Example (BB home), **2026-09-20 ~16:32 UTC**:

```text
HTTP/2 503
content-type: text/html
content-length: 807
platform: hostinger
panel: hpanel
server: hcdn
x-hcdn-request-id: 3975232ae6a6b85cb3a60cbe3c765813-fra-edge5
# no x-hcdn-upstream-rt
# no x-request-id
```

Body excerpt (public stock page):

```text
<title> 503 Service Unavailable </title>
<h1>503</h1>
<h2>Service Unavailable</h2>
<p>The server is temporarily busy, try again later!</p>
```

### Local V8 boot against shared testing DB (redacted)

Performed from repo on branch `V8` with testing `DATABASE_URL` present (value not printed):

```text
[local-v8-boot] keys DATABASE_URL=set PLATFORM_DEPLOYMENT_CODE=set ... SESSION_SECRET=set PORT=set
[blessboard] Platform database identity verified: environment_code=testing identity_key=moovex-platform-v7 host=aw***.pooler.supabase.com.
[platform] schemaCompatibility status=ok code=ok ...
[moovex] platform runtime listening on 127.0.0.1:18765 (deployment=moovex-platform-v8-testing, productSelection=hostname, platformLine=v8)
health HTTP 200 JSON includes:
  deploymentCode=moovex-platform-v8-testing
  platformLine=v8
  expectedIdentityKey=moovex-platform-v7
  expectedDatabaseEnvironment=testing
  gitSha=<local HEAD short>
```

Conclusion: **application code + shared DB identity can start.** The hosted failure is **outside** the reachable Node process.

---

## 3. Hostinger application and deployment configuration

| Item | Finding |
|------|---------|
| Intended topology | **One** separate Hostinger Node app (`moovex-platform-v8-testing`) serving **both** V8 hosts (same pattern as V7 unified testing) |
| Entrypoint (repo) | `npm start` → `node index.js` → `server.js`; Node `>=20` |
| Required env (names only) | `NODE_ENV=production`, `DEPLOYMENT_ENV=testing`, `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing`, `DATABASE_URL` (same testing DB as V7), `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`, `DATABASE_IDENTITY_ENV=testing`, distinct `SESSION_SECRET` |
| Optional media | `MEDIA_STORAGE_ROOT` outside `hbuilds/versions/…` (V7 uses `/home/<account>/moovex-media`); V8 writes `testing-v8/` |
| DNS | A/AAAA resolve for both V8 hosts (Hostinger anycast ranges) |
| SSL | Valid LE certs per hostname (issued 2026-09-20) |
| Domain → app binding | **Not verifiable** without hPanel — domains may be parked / unbound / bound to a stopped site |
| V7 comparison | Different A records than V8; V7 upstream healthy |

V8 does **not** inherit pronline.org Hostinger env automatically.

---

## 4. Local, remote, and hosted V8 SHA

| Ref | SHA |
|-----|-----|
| Local / `origin/V8` at diagnosis | `7cc0ee8c509819f4d3854454ba2cc2f1dd6021ad` |
| Hosted V8 | **Unavailable** (503) |
| Report tip after push | See `git rev-parse origin/V8` (this document’s commit) |

---

## 5. Code / infrastructure changes in this task

| Change | Purpose |
|--------|---------|
| `scripts/v8/diagnose-hosted-503.js` + `npm run test:v8:diagnose-503` | Operator read-only classification of hosted 503 |
| `tests/v8-p0-503-diagnosis.test.js` | Regression for edge classification + V8 routing when Node runs |
| Suite / coverage wiring | Include P0 diagnosis tests |
| **No** speculative routing / schema / V7 changes | Hosting action required |

No database migration. No production or V7 Hostinger changes.

---

## 6. Automated test results

| Gate | Result |
|------|--------|
| `tests/v8-p0-503-diagnosis.test.js` | **6/6 pass**, 0 fail, 0 skip |
| `npm run test:v8:diagnose-503` | Exit **3** — `HOSTINGER_EDGE_NO_UPSTREAM` |
| `npm run test:v8:regression:coverage` | **PASS** |

| Suite | Tests | Pass | Fail | Skip |
|-------|------:|-----:|-----:|-----:|
| `shared-platform` | 314 | 314 | 0 | 0 |
| `compatibility` | 229 | 229 | 0 | 0 |
| `blessboard` | 241 | 241 | 0 | 0 |
| `activeclinic` | 104 | 104 | 0 | 0 |

(Suites overlap some shared files by design; each suite gate independently green.)

---

## 7. Coverage for modified code

Aggregate coverage gate: **lines 92.17%**, branches **64.87%**, functions **95.62%**, statements **92.17%** → PASS

| Module | Lines | Branches |
|--------|------:|---------:|
| `src/platform/ops/hostingerUpstreamProbe.js` | **94.85%** | 64.86% |
| `src/platform/build/applicationBuildInfo.js` | **100%** | 75% |

Diagnose script covered via unit classification tests + file-presence regression.
---

## 8. HTTP status of both V8 homepages

| URL | Status |
|-----|--------|
| `https://blessboard.neuniversity.org/` | **503** |
| `https://activeclinic.neuniversity.org/` | **503** |

---

## 9. Health-check results

| URL | Status |
|-----|--------|
| `https://blessboard.neuniversity.org/healthz` | **503** |
| `https://activeclinic.neuniversity.org/healthz` | **503** |
| Local V8 `/healthz` (diagnostic boot) | **200** (`moovex-platform-v8-testing`) |

---

## 10. V7 smoke-test results (read-only)

| URL | Status |
|-----|--------|
| `https://blessboard.pronline.org/healthz` | **200** — `moovex-platform-testing`, `gitSha=03a89106e2fe`, identity `moovex-platform-v7`/`testing` |
| `https://activeclinic.pronline.org/healthz` | **200** — same |
| `https://blessboard.pronline.org/` | **200** |
| `https://activeclinic.pronline.org/` | **200** |

V7 application code and Hostinger testing deployment left unchanged.

---

## 11. Shared database compatibility

- Identity key: `moovex-platform-v7`  
- Environment: `testing`  
- Confirmed on hosted **V7** `/healthz` and on **local V8** boot against the same testing DB.  
- Hosted V8 worker binding **not** confirmed (process unreachable).

---

## 12. Production untouched

`https://blessboard.com/healthz` → `moovex-platform-production` / `production` (checked in prior freeze; no production deploy performed in this task).

---

## 13. Required manual Hostinger actions (unblock)

Perform in **hPanel** on a **new or dedicated** Node.js application (do **not** restart or rebind V7 `*.pronline.org`):

1. **Websites → Node.js → Create** (suggested name: `moovex-platform-v8-testing`).
2. Connect GitHub `akivmoovex/getproapp`, branch **`V8`**, Node **20+**, start **`npm start`** (file `index.js`).
3. **Domains:** attach `blessboard.neuniversity.org` and `activeclinic.neuniversity.org` to **this** app (not static `public_html`, not the V7 worker).
4. Set environment variables (copy secrets from operator vault — do not invent):

```env
NODE_ENV=production
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing
DATABASE_URL=<same V7 testing PostgreSQL URL>
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=testing
SESSION_SECRET=<new secret distinct from V7>
GETPRO_PG_SSL=no-verify
GETPRO_GIT_SHA=<deployed commit>
```

5. Optional but recommended: `MEDIA_STORAGE_ROOT` = durable path outside `hbuilds/versions/…` (same tree as V7 is OK; V8 writes `testing-v8/`).
6. **Deploy** then **Restart** the V8 app only.
7. Verify:
   - Both `/healthz` → 200 JSON with `deploymentCode=moovex-platform-v8-testing`, `platformLine=v8`, `gitSha` matching `origin/V8`
   - Both `/` → 200 with BB / AC branding
   - V7 `/healthz` still 200 on pronline.org
8. Re-run: `npm run test:v8:diagnose-503` (expect exit 0).

Until step 7 succeeds, status remains **HOSTING_ACTION_REQUIRED**.

---

## Final status

**`V8_P0_503_ROOT_CAUSE_IDENTIFIED_HOSTING_ACTION_REQUIRED`**

Confirmed: Hostinger serves stock edge 503 with no Node upstream for both V8 hosts.  
Application code starts locally against the shared testing DB.  
Hostinger panel/logs inaccessible from Cursor → cannot finish A vs B vs D distinction inside the panel; **manual Hostinger Node app create/bind/start is required**.
