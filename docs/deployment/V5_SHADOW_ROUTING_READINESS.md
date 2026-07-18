# BlessBoard V5 — Shadow routing readiness

**Date:** 2026-07-19
**Assessed mode:** `BLESSBOARD_TENANT_ROUTING_MODE=shadow`
**Constraint:** Read-only assessment. **Do not** change environment variables, deploy, or modify data from this document alone.
**This pass does not enable shadow mode.**

**Companions:** [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md)

**Code inspected:** `src/blessboard/config/tenantRoutingMode.js` · `src/blessboard/http/evaluateTenantRoute.js` · `src/blessboard/http/loadBlessBoardTenantRouting.js` · platform host-context / comparison loaders · [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md)

---

## Recommendation (summary)

| Decision | **GO** |
|----------|--------|
| Meaning | Catalogue + deployment mapping for the demo hostname fully resolve; routing/host/authorization tests pass; shadow keeps foundation HTML and emits observational logs only. |
| Not included | Enabling shadow, authoritative cutover, or full E2E (users/content still MISSING per demo readiness). |
| Operator gate | Confirm Hostinger already runs V5 foundation with matching `PLATFORM_DEPLOYMENT_CODE` and DNS before flipping the mode flag. |

---

## 1. Required Hostinger environment variables

Set on the **V5 Hostinger** application (testing foundation). Do **not** set these from this assessment run.

| Variable | Required value / rule | Why for shadow |
|----------|----------------------|----------------|
| `DATABASE_URL` | V5 Supabase URL only | Domain + catalogue resolution |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` | Identity gate |
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` | Deployment comparison vs domain row |
| `DEPLOYMENT_ENV` | `testing` (until promote approved) | Foundation mode pairing |
| `BLESSBOARD_TENANT_ROUTING_MODE` | **`shadow`** when enabling | Feature flag (leave `off` until operator flip) |
| `SESSION_SECRET` | ≥32 chars | Sessions still load; does not change public HTML in shadow |
| `SESSION_COOKIE_NAME` | e.g. `blessboard_org_v5_sid` (host-only) | Must **not** use `Domain=.blessboard.org` |
| `BASE_DOMAIN` / church/apex domain vars | `blessboard.org` family | Apex vs tenant host classification |
| `PLATFORM_HOST_CONTEXT_MODE` | Prefer `diagnostic` (cutover runbook) | Supports resolution diagnostics |

**Mode semantics** (`tenantRoutingMode.js`):

- Unset / invalid → treated as `off`
- Not inferred from `NODE_ENV`, hostname, or Git branch

---

## 2. Variables that must remain unset

| Variable | Why |
|----------|-----|
| `GETPRO_DATABASE_URL` | Must never point V5 Hostinger at the legacy V4 database |
| Parent-domain cookie `Domain=.blessboard.org` | Not an env var, but cookie attribute must stay host-only |

Do **not** enable `authoritative` until shadow sign-off and demo E2E prerequisites are READY.

---

## 3. Expected demo hostname

| Field | Value |
|-------|--------|
| Hostname | `diagnostic.blessboard.org` |
| Domain type | `canonical` |
| Domain status | `active` |
| Domain primary | `true` |
| Domain id (ops cross-check only) | `d3e2c873-7daa-471e-97f1-cafdfd5fa3dd` |
| Bound deployment | `blessboard-org-v5` (`active` / `testing`, `canonical_domain=blessboard.org`) |
| Curl | `Host: diagnostic.blessboard.org` against Apex origin `https://blessboard.org/` |

Unknown-host control: `unknown.blessboard.org` → foundation **200** in shadow (not tenant CMS).

---

## 4. Expected organization relationship

| Field | Value |
|-------|--------|
| `organization_key` | `diagnostic-church` |
| Status | `active` |
| `data_environment` | `testing` |
| Organization id (ops only) | `25177d51-b156-447b-9fd3-e95149c125be` |
| Product enrolment | `product_key=blessboard`, `product_tenant_key=diagnostic-church`, `status=active` |

Keys preferred in logs; UUIDs must **not** appear in public HTML.

---

## 5. Expected church relationship

| Field | Value |
|-------|--------|
| `church_key` | `diagnostic-church` |
| Status | `active` |
| `data_environment` | `testing` |
| Church id (ops only) | `90be2f34-9f0d-481a-a04c-46f9fb8557e4` |
| Parent org | `diagnostic-church` |

---

## 6. Expected HQ branch relationship

| Field | Value |
|-------|--------|
| `branch_key` | `hq` |
| `branch_type` | `hq` |
| Status | `active` |
| Branch id (ops only) | `d1b3821f-5bb6-48a2-9939-d7686ee666b8` |
| Parent church | `diagnostic-church` |

---

## 7. Expected primary branch relationship

| Field | Value |
|-------|--------|
| Primary `branch_key` | `hq` |
| `is_primary` | `true` |
| Same row as HQ? | **Yes** (HQ may be primary; separate campus primary **NOT REQUIRED**) |
| Branch id | same as HQ above |

Shadow logs emit **`primaryBranchKey`** (not a separate `hqBranchKey`). On this tenant HQ ≡ primary.

---

## 8. Logs to inspect

| Item | Detail |
|------|--------|
| Prefix | `[blessboard-tenant-routing]` |
| Event | `blessboard_tenant_route_shadow` |
| Emitter | `loadBlessBoardTenantRouting.js` → `logShadow` |
| Trigger | Public path on resolved tenant Host while mode=`shadow` |
| Suppressed | `/healthz`, `/build/*`, static extensions (css/js/images/fonts) via `shouldSkipDiagnosticLog` |

Optional related: platform diagnostic / host-comparison lines when `PLATFORM_HOST_CONTEXT_MODE=diagnostic`.

Authoritative event `blessboard_tenant_route` must **not** be the primary signal while mode is `shadow`.

---

## 9. Expected diagnostic messages

For `GET /` with `Host: diagnostic.blessboard.org` after operators enable shadow:

| Field | Expected |
|-------|----------|
| `event` | `blessboard_tenant_route_shadow` |
| `hostname` | `diagnostic.blessboard.org` |
| `platformResultType` | `resolved_tenant` |
| `catalogueResultType` | `resolved` |
| `proposedRouteOutcome` | `foundation` |
| `proposedReason` | `shadow_match` |
| `organizationKey` | `diagnostic-church` |
| `churchKey` | `diagnostic-church` |
| `primaryBranchKey` | `hq` |
| `deploymentComparisonResult` | `match` |
| `path` | `/` |
| HTTP body | Apex/foundation HTML — **not** tenant-public CMS |

**Must not appear in the log line:** passwords, CSRF secrets, session tokens, `DATABASE_URL`, raw transfer secrets.

**Resolution chain:**

1. Hostname → `platform.domains` → organization + product + deployment (`resolveHostname`)
2. Organization → BlessBoard catalogue → church + HQ + primary
3. `evaluateTenantRoute` in `shadow` → `outcome=foundation`, `reason=shadow_match`, `authoritative=false`, proposed tenant for logs only

---

## 10. Failure conditions

| Condition | Shadow HTTP behavior | Log / signal |
|-----------|----------------------|--------------|
| Mode still `off` | Foundation **200**, no shadow event | Missing `blessboard_tenant_route_shadow` |
| `PLATFORM_DEPLOYMENT_CODE` mismatch | Foundation **200** (fail-soft) | `deployment_mismatch` / `deploymentComparisonResult=mismatch` |
| Unknown hostname | Foundation **200** | `unknown_domain` (or similar) — not tenant CMS |
| Inactive domain / org / enrolment / church / HQ / primary | Foundation **200** | Typed reason (`inactive_*`, `*_missing`, …) |
| Non-BlessBoard product | Foundation **200** | `not_blessboard_tenant` |
| Tenant CMS HTML on tenant Host | **FAIL** | Church name / `data-bb-shell` tenant-public markers |
| 5xx / stack on `/` or `/login` | **FAIL** | Error body / Hostinger error log |
| Secrets in shadow JSON | **FAIL** | Pattern match in log line |
| DNS not pointing at V5 app | Wrong app / NXDOMAIN | No V5 logs |

Shadow **never** switches public HTML to 404/503 for catalogue misses — those stay foundation until **authoritative**.

---

## 11. Security checks

| # | Check | Pass criteria |
|---|-------|---------------|
| S1 | No tenant CMS on shadow | Foundation HTML only for demo Host |
| S2 | Shadow log hygiene | Keys only; no secrets/tokens/URLs with credentials |
| S3 | Cookie scope | Host-only session cookie; not parent Domain |
| S4 | No `GETPRO_DATABASE_URL` | Unset on V5 Hostinger |
| S5 | No legacy tables | `public.tenants` / `public.session` absent (demo readiness) |
| S6 | Deployment identity ≠ DB identity | `blessboard-org-v5` vs `blessboard-platform-v5` kept distinct |
| S7 | Unknown host | Foundation, not another tenant’s CMS |
| S8 | Static/health quiet | No shadow spam for `/healthz` / static |

---

## 12. Rollback procedure

Operators only (not executed by this assessment):

```bash
# Hostinger env + restart all workers
BLESSBOARD_TENANT_ROUTING_MODE=off
```

Then verify:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML

# Confirm new requests no longer emit blessboard_tenant_route_shadow
```

No database rollback. No need to touch domains/orgs for a mode rollback.

---

## 13. Manual verification steps

**Do not flip the flag until Hostinger prerequisites are confirmed.** When operators choose to enable:

### 13.1 Preflight (before flip)

1. Confirm Hostinger has `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, V5 `DATABASE_URL`, identity expected, mode currently `off`.
2. Confirm DNS for `diagnostic.blessboard.org` reaches the V5 app.
3. Confirm catalogue still matches §§3–7 (or re-run demo readiness read-only checks).
4. Baseline: Apex `/healthz` **200**; Tenant Host `/` foundation **200** with no church CMS chrome.

### 13.2 Enable (operators)

1. Set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`.
2. Restart all Hostinger workers.
3. Record timestamp (ISO-8601).

### 13.3 Verify HTTP

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS https://blessboard.org/ | head -c 2000
# expect apex/foundation marketing markers; not tenant-public shell

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/
# expect 200

curl -sS -H 'Host: diagnostic.blessboard.org' https://blessboard.org/ | head -c 4000
# expect foundation/apex chrome
# must NOT contain tenant CMS title chrome / data-bb-shell="tenant-public"

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/healthz
# expect 200; no new shadow log for /healthz
```

### 13.4 Verify logs

1. Request `GET /` with `Host: diagnostic.blessboard.org`.
2. Find `[blessboard-tenant-routing]` + `blessboard_tenant_route_shadow`.
3. Confirm keys in §9; confirm `deploymentComparisonResult=match`.
4. Confirm no secret substrings.

### 13.5 Negative spot-check

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/
# expect 200 foundation (shadow); log reason unknown_domain / not resolved
```

### 13.6 Sign-off

| Check | ☐ |
|-------|---|
| Foundation HTML on demo Host | ☐ |
| Shadow log keys match §9 | ☐ |
| Deployment comparison `match` | ☐ |
| No tenant CMS chrome | ☐ |
| No secrets in logs | ☐ |
| Apex `/healthz` still 200 | ☐ |
| Rollback procedure understood | ☐ |

**Stop before authoritative** if any row fails.

---

## 14. GO or NO-GO recommendation

| Question | Answer |
|----------|--------|
| Ready for operators to set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`? | **GO** |
| Ready for authoritative / full demo E2E? | **NO-GO** until users + published content ([`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md)) |
| Did this assessment enable shadow? | **No** |

**GO rationale:** Hosted catalogue for `diagnostic.blessboard.org` fully resolves org → BlessBoard enrolment → church → HQ/primary → active domain on `blessboard-org-v5` with compatible `testing` environments. Implementation and tests prove shadow is observational-only (foundation HTML + safe key logs). Missing demo users/CMS content do **not** block shadow validation.

### Inspection matrix (this assessment)

| Area | Result |
|------|--------|
| Platform domain mapping | **READY** |
| Deployment mapping | **READY** (`blessboard-org-v5`) |
| Organization resolution | **READY** |
| Product enrolment | **READY** |
| Church resolution | **READY** |
| HQ branch resolution | **READY** |
| Primary branch resolution | **READY** |
| Environment compatibility | **READY** (all `testing` / `active`) |
| Diagnostic logging | **READY** in code |
| Tenant route comparison | **READY** (match/mismatch/unavailable; shadow keeps foundation) |
| Demo tenant readiness doc | **Aligned** — shadow YES; full E2E NO |
| Routing / host / authz tests | **PASS** (see §15) |

### Missing prerequisites (do **not** block shadow)

- Test users / roles / published Home/About / operational samples — required for authoritative E2E only
- Operator confirmation of live Hostinger env + DNS (manual; not verified by this local assessment)

---

## 15. Automated tests (this assessment)

| Command | Result |
|---------|--------|
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:platform:http-context` | **22/22 pass** |
| `npm run test:platform:host-comparison` | **24/24 pass** (deployment identity ≠ database identity) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `git diff --check` | **clean** |

---

## 16. Suggested commit message

```
Document V5 shadow routing readiness for diagnostic-church.
```

## 17. Next manual deployment action

1. On Hostinger V5, confirm required env (§1) and unset `GETPRO_DATABASE_URL` (§2).
2. Confirm DNS for `diagnostic.blessboard.org` hits the V5 app.
3. Set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`, restart all workers, run §13 verification.
4. Capture `blessboard_tenant_route_shadow` evidence; only then plan authoritative cutover after demo readiness gaps close.
