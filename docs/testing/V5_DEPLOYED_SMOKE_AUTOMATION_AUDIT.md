# BlessBoard V5 — Deployed smoke automation audit

**Date:** 2026-07-19  
**Mode:** Audit only — **no implementation**, **no execution against production or Hostinger**  
**Companions:** [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md) · [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) · [`V5_TEST_COMMAND_CATALOGUE.md`](./V5_TEST_COMMAND_CATALOGUE.md) · [`V5_ROUTE_AND_LINK_AUDIT.md`](./V5_ROUTE_AND_LINK_AUDIT.md) · [`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md) · [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Does automated **deployed** HTTP smoke exist today? | **No** — hosted smoke is **manual** runbooks; local suites use in-process Express + ephemeral Postgres |
| Can a **read-only** automated subset run against the **testing** deployment without modifying data? | **Yes** — apex/tenant GETs, `/healthz`, unknown-host, login **page**, unauth redirects, static assets, header/secret scans |
| Safe to point local npm suites (`test:blessboard:*`) at Hostinger `DATABASE_URL`? | **PROHIBITED** — they write ephemeral-style fixtures via `foundationDb` / provision helpers |
| Implement automation in this batch? | **Accepted later** — see [`V5_DEPLOYED_SMOKE_RUNNER.md`](./V5_DEPLOYED_SMOKE_RUNNER.md) (`npm run smoke:v5:deployed`) |

**Implemented next batch:** testing-only, GET/HEAD smoke runner — [`V5_DEPLOYED_SMOKE_RUNNER.md`](./V5_DEPLOYED_SMOKE_RUNNER.md).

---

## 2. Classification legend

| Class | Meaning | Data impact |
|-------|---------|-------------|
| **SAFE READ-ONLY** | HTTP GET (or HEAD) only; no credentials; no session create | None (aside from access logs / rate counters) |
| **SAFE WITH TEST ACCOUNT** | Needs demo persona credentials; may create a **session** row | Session write only; no CMS/member/content mutations if GET-only after login |
| **WRITES TEST DATA** | POST/PUT that creates or mutates durable rows (registrations, content, media, approvals) | Durable demo/testing DB changes |
| **MANUAL ONLY** | Needs human judgment, fixtures, or multi-viewport UX | Varies |
| **PROHIBITED** | Must never run against production; or unsafe even on testing without explicit ops approval | High risk |

**Hard environment rule for any future automation**

| Gate | Rule |
|------|------|
| Target | Only Hostinger **testing** deployment: `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + `DEPLOYMENT_ENV=testing` |
| DB identity | `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5` (ops verify separately — not from smoke HTTP) |
| Production | **Do not run** when `DEPLOYMENT_ENV=production` or against unknown/customer hosts |
| Secrets | No passwords in CLI args, CI logs, or repo; follow [`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md) |

---

## 3. Inventory of existing assets

### 3.1 HTTP / automated tests (local only)

| Asset | What it does | Hosted deploy? | Class if pointed at live host |
|-------|--------------|----------------|-------------------------------|
| `tests/blessboard-auth-http.test.js` | Apex login POST, session, CSRF | No — `foundationDb` | **PROHIBITED** (writes users/sessions on whatever DB URL is set) |
| `tests/blessboard-tenant-auth.test.js` | Tenant transfer / host login | Local ephemeral | **PROHIBITED** |
| `tests/blessboard-apex-auth-gui.test.js` | Login HTML presentation | Filesystem / render | N/A (not HTTP against deploy) |
| `tests/blessboard-apex-home.test.js` / `apex-marketing` | Apex GET via local app | Local | Local only |
| `tests/blessboard-*-public-pages*.js` | Tenant public GET | Local | Local only |
| `tests/v5-foundation-startup.test.js` | `/healthz`, boot modes | Local | Local only |
| `tests/blessboard-tenant-routing.test.js` | Unknown host, routing modes | Local | Local only |
| `tests/blessboard-authoritative-host-allowlist.test.js` | Allow-list + foundation deny | Local | Local only |
| `tests/blessboard-authorization.test.js` | Role gates, redirects | Local + DB writes | **PROHIBITED** against hosted |
| `tests/platform-v5-sessions.test.js` | Session create/revoke | Ephemeral writes | **PROHIBITED** |
| `tests/church-pilot-smoke-suite.test.js` | Alias skip → regression suite | Local | Not a deployed smoke |
| `npm run test:blessboard:v5:regression` | Full local V5 gate | Ephemeral DB | **PROHIBITED** as “deployed smoke” |
| `npm run test:church:pilot-smoke` | V4-era foundation/growth regression | Local | Out of V5 deployed scope |
| Playwright `tests/e2e/*` | Browser E2E (incl. security) | Separate harness | **MANUAL ONLY** / gated; not V5 deployed smoke |

**Finding (at audit time):** No deployed smoke runner yet. **Now:** `npm run smoke:v5:deployed` (read-only). Full hosted demo E2E remains manual.

### 3.2 Manual E2E / GUI smoke plans

| Doc | Scope | Notes |
|-----|-------|-------|
| [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md) | T01–T31 journeys | Full plan needs authoritative + personas + CMS; apex GETs OK earlier |
| [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) | Post-cutover GUI matrix | Includes writes (register, media, CSRF POST) |
| [`docs/blessboard-pilot-smoke-test.md`](../blessboard-pilot-smoke-test.md) | V4 pilot / demo.blessboard.com | Legacy hostnames; not V5 foundation automation |
| [`docs/FIELD_AGENT_POST_FIX_SMOKE.md`](../FIELD_AGENT_POST_FIX_SMOKE.md) | GetPro field-agent | Out of BlessBoard V5 scope |

### 3.3 Route inventory

[`V5_ROUTE_AND_LINK_AUDIT.md`](./V5_ROUTE_AND_LINK_AUDIT.md) — **310** method+path patterns; primary **SAFE READ-ONLY** candidates are apex marketing GETs, tenant public GETs, `/healthz`, `/login` GET, unauthenticated hits on protected prefixes. All `POST` routes are **WRITES TEST DATA** or session mutation unless explicitly CSRF-negative probes (**MANUAL ONLY** / **PROHIBITED** in automation).

### 3.4 Deployment identity (testing)

| Key | Testing value (documented) |
|-----|----------------------------|
| Apex | `https://blessboard.org` |
| Demo tenant | `https://diagnostic.blessboard.org` / org `diagnostic-church` / branch `hq` |
| App | `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` |
| Env | `DEPLOYMENT_ENV=testing` |
| DB identity | `blessboard-platform-v5` |

Smoke automation must treat this as **testing**, not customer production — but still **avoid writes** because the DB is shared ops data.

### 3.5 Demo credentials

[`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md): PA / HQ / BA / MEM in vault only; no passwords in Git; rotation rules. **SAFE WITH TEST ACCOUNT** checks require vault-sourced secrets via CI secret store or operator env — never committed.

---

## 4. Candidate checks (user list) — classification

| Check | Class | Notes |
|-------|-------|-------|
| Apex GET pages (`/`, `/features`, `/pricing`, `/directory`, `/register-church`, `/for-churches`) | **SAFE READ-ONLY** | Aligns T01–T05; enquiry GET only |
| Tenant public GET pages (`/`, `/about`, … published paths) | **SAFE READ-ONLY** | Requires authoritative + published content for CMS chrome; under `off`/`shadow` expect foundation **200** — assert mode-aware |
| Health / startup diagnostics (`GET /healthz`) | **SAFE READ-ONLY** | Expect `{"ok":true,"mode":"v5-foundation"}`; avoid `DEBUG_HOST=1` body assertions in CI (extra headers) |
| Unknown-host rejection | **SAFE READ-ONLY** | `Host: unknown….blessboard.org` → controlled not-found / foundation (mode-dependent); never 500 |
| Login **page** (`GET /login` apex; tenant `GET /login` → transfer redirect) | **SAFE READ-ONLY** | Form present; no password POST |
| Protected route redirects (unauthenticated `GET /account`, `/admin`, `/hq`, `/branch-admin`, `/member`) | **SAFE READ-ONLY** | Expect redirect/403/503 per host — no cookie |
| Static asset availability | **SAFE READ-ONLY** | Parse HTML for `/blessboard/v5/*.css?v=` / JS; GET asset → **200** |
| Security headers | **SAFE READ-ONLY** | Assert present headers on sample GETs (e.g. `Referrer-Policy` where set); do not require full Helmet suite if not globally applied |
| No secret leakage | **SAFE READ-ONLY** | Regex scan response bodies for `DATABASE_URL`, `SESSION_SECRET`, connection strings, private storage keys (T29 subset on anon pages) |
| Login **attempts** (valid/invalid POST) | **SAFE WITH TEST ACCOUNT** (valid) / **PROHIBITED** if brute-force | Valid login creates session; invalid may hit throttle — limit to **1** bad attempt max |
| Registration POST | **WRITES TEST DATA** | T11 |
| CMS / admin / HQ writes, status changes | **WRITES TEST DATA** | T13–T17 writes |
| Media upload / archive | **WRITES TEST DATA** | T18–T19 |
| Migrations / seed / provision CLIs | **PROHIBITED** as smoke | Separate ops runbooks |
| CSRF reject POSTs | **MANUAL ONLY** or careful **SAFE WITH TEST ACCOUNT** | Mutates nothing if 403, but still POSTs — keep out of minimal automation |
| Mobile UX / Stitch parity | **MANUAL ONLY** | T28 / GUI checklist |

---

## 5. Journey map (T01–T31) for automation

| ID | Summary | Class for **deployed automation** |
|----|---------|-----------------------------------|
| T01–T05 | Apex marketing GETs | **SAFE READ-ONLY** |
| T06–T07 | Tenant public GETs / nav | **SAFE READ-ONLY** (mode-aware) |
| T08 | Tenant login redirect | **SAFE READ-ONLY** |
| T09 | Apex auth POST + cookies | **SAFE WITH TEST ACCOUNT** (subset); cookie Domain check after one login |
| T10 | Transfer callback | **SAFE WITH TEST ACCOUNT** (session + redirect chain) |
| T11–T13 | Register + approve | **WRITES TEST DATA** |
| T14–T17 | Portal shells GETs | **SAFE WITH TEST ACCOUNT** if GET-only; write spot-checks **WRITES** / **MANUAL** |
| T18–T19 | Media | **WRITES TEST DATA** / private GET may be **SAFE WITH TEST ACCOUNT** if asset already public |
| T20 | Logout | Session revoke → mild write; **SAFE WITH TEST ACCOUNT** (optional; not minimal) |
| T21–T26 | Negative role/branch/church/inactive | Mostly **MANUAL ONLY** (fixtures) or **SAFE WITH TEST ACCOUNT** GET negatives |
| T27 | CSRF | **MANUAL ONLY** |
| T28 | Mobile nav | **MANUAL ONLY** |
| T29 | Secret leakage (anon pages) | **SAFE READ-ONLY**; authenticated pages → **SAFE WITH TEST ACCOUNT** |
| T30 | Dead links (click-all) | **SAFE READ-ONLY** for anon nav; authenticated → **SAFE WITH TEST ACCOUNT**; prefer status check over browser |
| T31 | Legacy DB / env | **MANUAL ONLY** / ops (`db:identity:check` — not HTTP smoke) |

GUI production smoke **M1–M11** / write modules map the same way: M1 apex GET + login page = read-only; login POST = test account; M4+ writes = not in minimal automation.

---

## 6. Blocked / unsafe against deployed environments

| Item | Why blocked |
|------|-------------|
| Entire `test:blessboard:v5:regression` against hosted DB | Ephemeral provision + schema writes |
| `blessboard:user:create`, `platform:tenant:provision --confirm`, `church:seed-demos` | Durable writes |
| `migrate:v4-to-v5:apply` / `db:migrate` / `db:identity:init` | **PROHIBITED** as smoke |
| Repeated invalid logins | Throttle / lockout noise |
| Field-agent POST rate-limit hammer | Unrelated product; DoS-like |
| Production `DEPLOYMENT_ENV=production` hosts | **PROHIBITED** |
| Logging passwords or Set-Cookie values in CI | Credential plan violation |

---

## 7. Credentials required (by class)

| Automation tier | Credentials |
|-----------------|-------------|
| **SAFE READ-ONLY** (minimal) | **None** — public HTTPS only |
| **SAFE WITH TEST ACCOUNT** (batch 2) | Vault: at least one of MEM / BA / HQ / PA per surface; prefer MEM for member GETs, PA for `/admin` GETs — never commit |
| Writes / full E2E | Full persona set + disposable register email — **manual** or separate approved job |

Identity checks (`db:identity:check`) use ops DB URL + `DATABASE_IDENTITY_EXPECTED` — **not** part of HTTP smoke; ops-only.

---

## 8. Recommended minimal automated smoke (testing deployment only)

**Do not implement until Leadership accepts this scope.**

### Intent

One command, **GET-only**, fail-fast, allowlisted base URL, no login POST, no DB env required in the runner.

### Proposed command (future)

```bash
# FUTURE — not implemented in this audit
npm run smoke:v5:deployed:readonly -- \
  --base-url https://blessboard.org \
  --tenant-host diagnostic.blessboard.org \
  --require-deployment-env testing
```

### Proposed checks (minimal set)

1. `GET {base}/healthz` → **200**, JSON `ok===true`, `mode` contains `v5`  
2. `GET {base}/` `/features` `/pricing` `/directory` `/register-church` `/login` → **200**  
3. Static: from home HTML, one CSS + one JS under `/blessboard/v5/` → **200**  
4. `GET {base}/account` (no cookie) → redirect or **401/403** (not **200** app shell)  
5. `GET {base}/admin` (no cookie) → not privileged **200**  
6. `GET {base}/` with `Host: {tenant-host}` → **200** (foundation or CMS per routing mode; assert not **5xx**)  
7. `GET {base}/` with `Host: unknown-smoke-<utc>.blessboard.org` → controlled failure (not **5xx**; not another org’s CMS)  
8. Response body scan on (2)(6): reject matches for secret patterns (T29 anon subset)  
9. Optional: assert `Referrer-Policy` (or documented security header) on `/` and `/login`

### Explicitly out of minimal command

Login POST, transfer, registration, portals with session, CSRF POSTs, uploads, migrations, Playwright screenshots.

### Operator curl sketch (manual until implemented)

```bash
# Templates only — do not run against production; testing apex only
BASE=https://blessboard.org
TENANT_HOST=diagnostic.blessboard.org

curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/healthz"
curl -sS "$BASE/healthz"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/login"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/account"
curl -sS -o /dev/null -w '%{http_code}\n' -H "Host: $TENANT_HOST" "$BASE/"
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' "$BASE/"
```

---

## 9. Report summary

### Safe tests (automate first)

- Apex marketing + login **GET**  
- `/healthz`  
- Unauthenticated protected redirects  
- Tenant Host GET (mode-aware **200**, not **5xx**)  
- Unknown-host controlled response  
- Static V5 assets referenced by home  
- Anon HTML secret-pattern scan  
- Optional security-header presence  

### Blocked tests (not in minimal automation)

- All local DB-backed `test:blessboard:*` against hosted URL  
- Login POST / transfer / logout (batch 2 at earliest)  
- Registration, approvals, CMS writes, media upload  
- CSRF hammer, wrong-role fixture matrix, mobile UX  
- Migrations, seeds, provision `--confirm`  
- Anything against production  

### Credentials required

- **Minimal tier:** none  
- **Authenticated read tier:** vault demo personas per [`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md)  

### Recommended next batch

1. Accept this audit’s SAFE READ-ONLY scope.  
2. Implement `smoke:v5:deployed:readonly` with URL allowlist + fail closed if base host ∉ allowlist.  
3. Wire optional CI against **testing** only (manual trigger preferred initially).  
4. Batch 2 (separate approval): **SAFE WITH TEST ACCOUNT** GET shells after one login — still no registration/upload.  
5. Keep full T01–T31 as **MANUAL** until demo readiness (B02–B04) + routing gates close.

---

## Suggested documentation commit message

```
docs(testing): audit production-safe deployed V5 smoke automation

Classify existing smoke/E2E assets; recommend GET-only testing
deployment command without implementing or hitting production.
```
