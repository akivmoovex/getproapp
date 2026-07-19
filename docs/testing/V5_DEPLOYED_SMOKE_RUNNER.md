# BlessBoard V5 — Read-only deployed smoke runner

**Date:** 2026-07-19  
**Authority:** Implements the **SAFE READ-ONLY** scope from [`V5_DEPLOYED_SMOKE_AUTOMATION_AUDIT.md`](./V5_DEPLOYED_SMOKE_AUTOMATION_AUDIT.md).  
**Constraint:** GET/HEAD only. No login POST, registration, uploads, writes, or migrations.  
**This document does not authorize** running against production.

---

## Command

```bash
npm run smoke:v5:deployed -- --base-url https://blessboard.org \
  --tenant-host diagnostic.blessboard.org
```

JSON-only:

```bash
npm run smoke:v5:deployed -- --base-url https://blessboard.org --json
```

Unit / mock tests (no real deployment):

```bash
npm run test:blessboard:deployed-smoke
```

---

## Safeguards

| Gate | Behavior |
|------|----------|
| Explicit `--base-url` | Required; no default host |
| No embedded credentials | `user:pass@` in URL → fail |
| Testing allowlist | `blessboard.org`, `*.blessboard.org`, first-label `staging|stage|test|testing|qa|uat|preview|dev` |
| Extra staging hosts | `--allow-hostname <host>` (repeatable) |
| Localhost | Rejected unless `--allow-localhost` (mock rehearsal / unit tests) |
| `http://` | Non-localhost requires `--allow-http` |
| Production-classified hosts | `getproapp.org`, `blessboard.com`, www variants — rejected unless `--allow-production-hostname` (supervised) |
| Methods | **GET/HEAD only** — runner never issues POST/PUT/PATCH/DELETE |
| Reports | Sensitive query keys (`tr`, `token`, `password`, …) redacted to `REDACTED` |

---

## Checks performed

| Check | Expectation |
|-------|-------------|
| `GET /healthz` | **200**; JSON `ok: true`; mode contains `v5` / `v5-foundation` |
| Apex GETs `/`, `/features`, `/pricing`, `/directory`, `/register-church`, `/login` | **200**; BlessBoard / page markers; security header present; no secret/error text |
| `GET /account`, `GET /admin` (no cookie) | Redirect or **401/403/503** — not a privileged **200** shell |
| Tenant `Host: --tenant-host` on `/` | **200**; not **5xx** (optional flag) |
| Tenant `/login` | Redirect or **200** |
| Unknown host | **200** or **404**; controlled body; not **5xx** |
| Static assets | Up to two `/blessboard/v5/*.{css,js}` from home HTML → **200** |
| Security headers | At least one of: `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `HSTS` on HTML pages |
| Secret patterns | Fail on `DATABASE_URL`, postgres URLs, `SESSION_SECRET`, private keys, etc. |
| Internal error text | Fail on `Internal Server Error`, `node_modules` stacks, Sequelize errors, etc. |

---

## Outputs

1. **Human report** — pass/fail lines + redacted request list (default).  
2. **JSON report** — appended after human output, or alone with `--json`.

Exit codes: `0` pass · `1` smoke fail · `2` usage / unexpected error.

---

## Implementation map

| Path | Role |
|------|------|
| `src/blessboard/tools/deployedSmokeRunner.js` | Policy, checks, reporting |
| `scripts/smoke-v5-deployed.js` | CLI |
| `tests/blessboard-deployed-smoke.test.js` | Policy + mock HTTP server tests |
| `tests/fixtures/deployed-smoke/*` | HTML/JSON fixtures |

---

## What this does **not** do

- Login / transfer / logout  
- Registration or any CSRF POST  
- Media upload  
- Migrations / seeds / provision  
- Authenticated portal GETs (batch 2 — not in this runner)  
- Substitute for full [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md)

---

## Operator notes

- Prefer Hostinger **testing** apex (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, `DEPLOYMENT_ENV=testing`).  
- Do **not** run with `--allow-production-hostname` unless Leadership signed a supervised exception.  
- Tenant checks need authoritative (or foundation **200**) behaviour; unknown-host expectations differ by routing mode — runner accepts **200** or **404** only.
