# BlessBoard V5 — Shadow routing readiness

**Date:** 2026-07-18  
**Assessed mode:** `BLESSBOARD_TENANT_ROUTING_MODE=shadow`  
**Constraint:** Read-only assessment. **Do not** change environment variables or deploy from this document alone.  
**This pass does not enable shadow mode.**

**Companions:** [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md)

---

## Recommendation

| Decision | **GO** (catalogue + code ready for operators to enable shadow) |
|----------|----------------------------------------------------------------|
| Meaning | Demo tenant resolution shape is complete; routing tests pass; shadow keeps foundation HTML and emits observational logs. |
| Not included | Enabling shadow, authoritative cutover, or full E2E (users/content still missing per demo readiness). |
| Operator gate | Hostinger must already run V5 foundation with matching `PLATFORM_DEPLOYMENT_CODE` and DNS for the demo hostname. Confirm Hostinger env before flipping the mode flag. |

---

## 1. Required environment variables

Set on the **V5 Hostinger** application (values for testing foundation). Do **not** set these from this assessment run.

| Variable | Required value / rule | Why for shadow |
|----------|----------------------|----------------|
| `DATABASE_URL` | V5 Supabase URL only | Domain + catalogue resolution |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` | Identity gate |
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` | Deployment comparison vs domain row |
| `DEPLOYMENT_ENV` | `testing` (until promote approved) | Foundation mode pairing |
| `BLESSBOARD_TENANT_ROUTING_MODE` | **`shadow`** when enabling | Feature flag (currently leave `off` until operator flip) |
| `SESSION_SECRET` | ≥32 chars | Sessions still load; not used to change public HTML in shadow |
| `SESSION_COOKIE_NAME` | e.g. `blessboard_org_v5_sid` (host-only) | Must **not** use `Domain=.blessboard.org` |
| `BASE_DOMAIN` / `CHURCH_HOST_DOMAIN` / apex domain vars | `blessboard.org` family | Apex vs tenant host classification |
| `PLATFORM_HOST_CONTEXT_MODE` | Prefer `diagnostic` (cutover runbook) | V5 server forces diagnostic load for shadow/authoritative resolution regardless |

**Must remain unset on V5:** `GETPRO_DATABASE_URL`.

**Not required for shadow:** published CMS content, member/staff users (those block authoritative E2E only).

**Mode semantics** (`src/blessboard/config/tenantRoutingMode.js`):

- Unset / invalid → treated as `off`
- Not inferred from `NODE_ENV`, hostname, or Git branch

---

## 2. Expected demo hostname

| Field | Value |
|-------|--------|
| Hostname | `diagnostic.blessboard.org` |
| Domain type | `canonical` |
| Domain status | `active` |
| Domain primary | `true` |
| Domain id | `d3e2c873-7daa-471e-97f1-cafdfd5fa3dd` |
| Bound deployment | `blessboard-org-v5` |
| Curl Host header | `Host: diagnostic.blessboard.org` against Apex origin `https://blessboard.org/` |

Unknown host control sample: `unknown.blessboard.org` (expect foundation **200** in shadow, not tenant CMS).

---

## 3. Expected organization / church / branch IDs

Live hosted V5 row for the only provisioned org (read-only audit). Prefer **keys** in log review; IDs are for DB cross-check only and must **not** appear in public HTML.

| Entity | Key | UUID / code | Status notes |
|--------|-----|-------------|--------------|
| Organization | `diagnostic-church` | `25177d51-b156-447b-9fd3-e95149c125be` | `active`, `data_environment=testing` |
| Product enrolment | product `blessboard` | tenant key `diagnostic-church` | enrolment `active` |
| Church | `diagnostic-church` | `90be2f34-9f0d-481a-a04c-46f9fb8557e4` | `active` |
| HQ branch | `hq` | `d1b3821f-5bb6-48a2-9939-d7686ee666b8` | `branch_type=hq`, `active` |
| Primary branch | `hq` | **same row** `d1b3821f-5bb6-48a2-9939-d7686ee666b8` | `is_primary=true` |
| Deployment | `blessboard-org-v5` | code PK (no separate UUID column) | `active`, `environment_code=testing`, `canonical_domain=blessboard.org` |

**Resolution chain (code):**

1. Hostname → `platform.domains` → organization + product + deployment (`resolveHostname`)
2. Organization id → BlessBoard catalogue → church + HQ + primary (`getBlessBoardCatalogueContext`)
3. `evaluateTenantRoute` in `shadow` → `outcome=foundation`, `reason=shadow_match`, `authoritative=false`, proposed tenant attached for logs only
4. Response remains Apex/foundation HTML (church name must **not** appear)

---

## 4. Logging evidence to inspect

### Shadow event (required)

Log line prefix: `[blessboard-tenant-routing]`  
JSON `event`: **`blessboard_tenant_route_shadow`**

Emitted by `src/blessboard/http/loadBlessBoardTenantRouting.js` → `logShadow`.

| Field | Expected for demo hit on `/` |
|-------|------------------------------|
| `hostname` | `diagnostic.blessboard.org` |
| `platformResultType` | `resolved_tenant` |
| `catalogueResultType` | `resolved` |
| `proposedRouteOutcome` | `foundation` |
| `proposedReason` | `shadow_match` |
| `organizationKey` | `diagnostic-church` |
| `churchKey` | `diagnostic-church` |
| `primaryBranchKey` | `hq` |
| `deploymentComparisonResult` | `match` (when comparison available) |
| `path` | `/` |

**Must not appear in the log line:** passwords, CSRF secrets, session tokens, `DATABASE_URL`, raw transfer secrets.

**Note:** Shadow JSON logs **primary** branch key, not a separate `hqBranchKey` field. On this tenant HQ ≡ primary (`hq`), so one key covers both.

### Skipped paths (no shadow noise)

`shouldSkipDiagnosticLog` suppresses `/healthz`, `/build/*`, and static extensions (css/js/images/fonts). Confirmed by `tests/blessboard-tenant-routing.test.js`.

### Related (optional)

- `platform_host_comparison` / platform diagnostic logs when `PLATFORM_HOST_CONTEXT_MODE=diagnostic`
- Authoritative-only event `blessboard_tenant_route` must **not** be the primary signal while mode is `shadow`

---

## 5. Failure conditions

| Condition | Shadow HTTP behavior | Log / signal |
|-----------|----------------------|--------------|
| Mode still `off` | Foundation **200**, no shadow event | Missing `blessboard_tenant_route_shadow` |
| `PLATFORM_DEPLOYMENT_CODE` mismatch | Foundation **200** (shadow fail-soft) | `proposedReason` / platform type `deployment_mismatch`; `deploymentComparisonResult=mismatch` |
| Unknown hostname | Foundation **200** | `unknown_domain` (or similar) — **not** tenant CMS |
| Inactive domain / org / enrolment / church / HQ / primary | Foundation **200** | Typed reason (`inactive_*`, `*_missing`, …) |
| Non-BlessBoard product | Foundation **200** | `not_blessboard_tenant` |
| Tenant CMS HTML (church name) on tenant Host | **FAIL** — shadow must not render tenant | HTML contains church/branch display names |
| 5xx / stack traces on `/` or `/login` | **FAIL** | Error body / Hostinger error log |
| Secrets in shadow JSON | **FAIL** | Pattern match in log line |
| DNS not pointing at V5 app | Wrong app or NXDOMAIN | No V5 logs |

Shadow **never** switches public HTML to 404/503 for catalogue misses — those surfaces stay foundation until **authoritative**.

---

## 6. Rollback procedure

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

# Confirm shadow logs stop for new requests
```

No database rollback. No need to touch domains/orgs for a mode rollback.

---

## 7. Exact manual verification steps

**Do not flip the flag until Hostinger prerequisites are confirmed.** When operators choose to enable:

### 7.1 Preflight (before flip)

1. Confirm Hostinger has `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, V5 `DATABASE_URL`, identity expected, mode currently `off`.
2. Confirm DNS for `diagnostic.blessboard.org` reaches the V5 app.
3. Confirm catalogue still matches §3 (or re-run read-only checks from demo readiness).
4. Capture baseline: Apex `/healthz` **200**; Tenant Host `/` foundation **200** with no church name.

### 7.2 Enable (operators)

1. Set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`.
2. Restart all Hostinger workers.
3. Record timestamp (ISO-8601).

### 7.3 Verify HTTP

```bash
# Apex unchanged
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS https://blessboard.org/ | head -c 2000
# expect apex/foundation marketing markers; not tenant-public shell

# Demo tenant Host — still foundation HTML
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/
# expect 200

curl -sS -H 'Host: diagnostic.blessboard.org' https://blessboard.org/ | head -c 4000
# expect foundation/apex chrome
# must NOT contain "BlessBoard Diagnostic Church" as tenant CMS title chrome
# must NOT contain data-bb-shell="tenant-public"

# Quiet paths
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/healthz
# expect 200; no new shadow log for /healthz
```

### 7.4 Verify logs

1. Request `GET /` with `Host: diagnostic.blessboard.org`.
2. Find `[blessboard-tenant-routing]` + `blessboard_tenant_route_shadow`.
3. Confirm keys in §4; confirm `deploymentComparisonResult=match`.
4. Confirm no secret substrings.

### 7.5 Negative spot-check

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/
# expect 200 foundation (shadow); log reason unknown_domain / not resolved
```

### 7.6 Sign-off

| Check | ☐ |
|-------|---|
| Foundation HTML on demo Host | ☐ |
| Shadow log keys match §4 | ☐ |
| Deployment comparison `match` | ☐ |
| No tenant CMS chrome | ☐ |
| No secrets in logs | ☐ |
| Apex `/healthz` still 200 | ☐ |
| Rollback procedure understood | ☐ |

**Stop before authoritative** if any row fails.

---

## 8. Inspection summary (this assessment)

| Area | Result |
|------|--------|
| Domain mapping | **READY** — `diagnostic.blessboard.org` active canonical → `blessboard-org-v5` |
| Organization resolution | **READY** — `diagnostic-church` active |
| Church resolution | **READY** — `diagnostic-church` active |
| HQ branch resolution | **READY** — `hq` active |
| Primary branch resolution | **READY** — same `hq` row `is_primary=true` |
| Diagnostic / shadow logging | **READY** in code; event `blessboard_tenant_route_shadow` + skip rules |
| Tenant route comparison | **READY** — `deploymentComparisonResult` match/mismatch/unavailable; shadow keeps foundation on miss |
| Demo tenant readiness doc | **Aligned** — shadow **YES**; full E2E **NO** (users/content) |
| Routing tests | **PASS** — `npm run test:blessboard:tenant-routing` → **44/44** (includes shadow HTML + log + skip static/health) |

---

## 9. GO / NO-GO

| Question | Answer |
|----------|--------|
| Ready for operators to set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`? | **GO** |
| Ready for authoritative / full demo E2E? | **NO-GO** until users + published content (see demo readiness) |
| Did this assessment enable shadow? | **No** |

**GO rationale:** Hosted catalogue for `diagnostic.blessboard.org` fully resolves org → BlessBoard enrolment → church → HQ/primary → active domain on `blessboard-org-v5`; implementation and tests prove shadow is observational-only (foundation HTML + safe key logs). Missing demo users/CMS content do not block shadow validation.
