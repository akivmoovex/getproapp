# V5 authoritative pilot host allow-list — design

**Date:** 2026-07-19  
**Mode:** Design only — **do not enable** `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` from this document  
**Question:** Can a supervised pilot serve tenant HTML on **one approved demo hostname** while all other tenant hosts stay foundation (`shadow` / `off`)?  
**Demo target (when later approved):** `diagnostic.blessboard.org` / `diagnostic-church` / `hq` / deployment `blessboard-org-v5`

**Companions**

| Doc | Role |
|-----|------|
| [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) | Pilot NOT READY; gates |
| [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) | Shadow only; forbids authorizing authoritative |
| [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](./V5_ENVIRONMENT_VARIABLE_REFERENCE.md) | Current routing flag semantics |
| [`NETWORK_CUSTOM_DOMAIN_READINESS.md`](../product/NETWORK_CUSTOM_DOMAIN_READINESS.md) | Custom host also needs authoritative for live CMS |
| Code | `tenantRoutingMode.js`, `evaluateTenantRoute.js`, `loadBlessBoardTenantRouting.js`, `008_domains.sql` |

---

## Executive conclusion

| Field | Value |
|-------|--------|
| **Can the pilot be host-restricted today without code?** | **No** |
| **Recommended approach** | **B — approved-host allow-list** (env-configured; fail-closed) |
| **Verdict** | **SMALL IMPLEMENTATION REQUIRED** → **IMPLEMENTED** (code + tests; Hostinger not enabled) |
| **Did this design enable authoritative?** | **No** |

Turning on the existing global `authoritative` switch would apply to **every** hostname that resolves as an active BlessBoard tenant on the same Hostinger deployment / `PLATFORM_DEPLOYMENT_CODE`. That is unsafe for a one-host demo pilot whenever any other `platform.domains` row is active on `blessboard-org-v5`.

---

## Current behavior (evidence)

### Feature flag

```text
BLESSBOARD_TENANT_ROUTING_MODE = off | shadow | authoritative
```

- Parsed only by `getBlessBoardTenantRoutingMode` (`src/blessboard/config/tenantRoutingMode.js`).
- **Never** inferred from `NODE_ENV`, hostname, Git branch, or deployment code.
- Unset / invalid → `off`.

### Evaluation

`evaluateTenantRoute` (`src/blessboard/http/evaluateTenantRoute.js`):

| Mode | Resolved tenant public path |
|------|-----------------------------|
| `off` | Foundation (`routing_off`) |
| `shadow` | Foundation (`shadow_match`) + observational log |
| `authoritative` | Tenant HTML (`authoritative_match`) for **any** host that passes platform + catalogue gates |

There is **no** input for “is this hostname on a pilot list.”

### Domain resolver / registry

`platform.domains` (`008_domains.sql`): `hostname`, `domain_type` (`canonical` / `custom` / `alias` / `apex`), `status`, `is_primary`, org/product/deployment FKs.

**No** column such as `routing_pilot`, `authoritative_eligible`, or `serve_tenant_html`.

### Deployment configuration

- App identity: `PLATFORM_DEPLOYMENT_CODE` (e.g. `blessboard-org-v5`).
- Domain rows bind to a deployment; mismatch → fail-closed resolve (404 under authoritative; foundation under shadow).
- Deployment comparison is **match / mismatch**, not a per-host routing mode.

### Prerequisites posture

[`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) targets a **supervised diagnostic pilot** and keeps estate-wide cutover separate — but the **runtime flag cannot express that split** today. Combined migration runbook language (“pilot hosts only”) is **aspirational** relative to code.

---

## Option comparison

### A. One global authoritative switch (status quo)

| Aspect | Assessment |
|--------|------------|
| Mechanism | Set Hostinger `BLESSBOARD_TENANT_ROUTING_MODE=authoritative`; restart all workers |
| Security | **Weak for pilot** — every active tenant host on this deployment (canonical, alias, **custom**) can serve CMS |
| Operational simplicity | Highest — one env var |
| Rollback | Strong — set `off` / `shadow` + restart |
| Configuration risk | High blast radius if extra domains exist or are added mid-pilot |
| Testability | Already covered by routing suites |
| DB migration | None |
| Custom-domain behavior | Any active custom host on the same org/deployment also goes live |

**Fit for one-host pilot:** Poor unless ops can **prove** the only active BlessBoard tenant hostname on the deployment is the demo host (inventory + freeze on domain inserts). Even then, risk returns the moment a second domain is activated.

---

### B. Approved-host allow-list (recommended)

| Aspect | Assessment |
|--------|------------|
| Mechanism | Keep global mode; add a **second** env (or structured list) of exact hostnames allowed to render tenant HTML under authoritative. Hosts not listed keep **shadow semantics** (foundation HTML + optional log reason). |
| Security | **Strong** — blast radius = listed hosts only |
| Operational simplicity | High — env + restart; no DNS split |
| Rollback | Empty list / remove host / mode=`shadow`/`off` |
| Configuration risk | Medium — typo in hostname fails closed (good); must document normalization (lowercase, no trailing dot) |
| Testability | Straightforward unit + HTTP tests (on-list / off-list / unknown / custom) |
| DB migration | **None** for v1 |
| Custom-domain behavior | Custom hosts stay foundation **unless explicitly listed** — matches Model A “assisted” caution |

**Suggested shape (design — not implemented):**

```bash
# Global decision path still explicit
BLESSBOARD_TENANT_ROUTING_MODE=authoritative

# Pilot: exact hostnames only (comma-separated, normalized)
BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=diagnostic.blessboard.org

# Estate cutover later (explicit; do not use silent empty=all during pilot)
# BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=*
```

**Fail-closed pilot rule (recommended):**

| Mode | Allow-list | Behavior |
|------|------------|----------|
| `authoritative` | empty / unset | Treat as **`shadow`** (or `off`) + warn once — **do not** estate-serve by accident |
| `authoritative` | one+ hosts | Listed hosts → `render_tenant`; other resolved tenants → foundation + reason e.g. `authoritative_host_not_allowlisted` |
| `authoritative` | `*` (or documented token) | Current global behavior for production cutover |
| `shadow` / `off` | any | Unchanged; allow-list ignored |

Normalization must reuse the same hostname rules as `resolveHostname` / domain trigger (lowercase, strip trailing dot, reject port/path). **Do not** infer allow-list membership from organization key alone (aliases/custom hosts are different Host headers).

---

### C. Domain-record pilot flag

| Aspect | Assessment |
|--------|------------|
| Mechanism | Add e.g. `platform.domains.authoritative_pilot boolean` (or status enum); evaluator checks flag after resolve |
| Security | Strong if PA/CLI gated and audited |
| Operational simplicity | Medium — needs UI/CLI + runbook; risk of leaving flags set |
| Rollback | Flip flag or mode |
| Configuration risk | DB drift across environments; PA mistake enables wrong host |
| Testability | Good, but more surface |
| DB migration | **Required** |
| Custom-domain behavior | Per-row control (precise) |

**Fit:** Good **later** productization; **not** smallest for first diagnostic pilot. Larger than B; conflicts with “no migration while pilot gates open” preference.

---

### D. Separate pilot deployment

| Aspect | Assessment |
|--------|------------|
| Mechanism | Second Hostinger app (or deployment code) with only the demo domain bound; set that app to `authoritative` |
| Security | Strong isolation |
| Operational simplicity | **Low** — second env, TLS, DNS, identity, worker parity |
| Rollback | Point DNS away / mode off on pilot app |
| Configuration risk | Dual config drift; wrong `PLATFORM_DEPLOYMENT_CODE` |
| Testability | Integration-heavy |
| DB migration | None required if shared DB with domain.deployment_id filter; or separate DB (heavier) |
| Custom-domain behavior | Only domains bound to pilot deployment |

**Fit:** Valid for long-lived staging isolation; **overkill** for a short supervised demo pilot when B is available.

---

## Assessment matrix

| Criterion | A Global | B Allow-list | C Domain flag | D Separate deploy |
|-----------|:--------:|:------------:|:-------------:|:-----------------:|
| Security (pilot blast radius) | Poor | **Best** | Best | Best |
| Operational simplicity | **Best** | Good | Fair | Poor |
| Rollback speed | **Best** | **Best** | Good | Fair |
| Configuration risk | High | Low–Med | Med | Med–High |
| Testability | Good | **Best** | Good | Fair |
| DB migration impact | None | **None** | Required | None/optional |
| Custom-domain safety | Poor | **Good** (opt-in list) | Good | Good |
| Matches “one demo host” goal | No* | **Yes** | Yes | Yes |

\*Unless inventory proves a single active tenant host — fragile, not a control.

---

## Recommendation

**Smallest safe approach: B — approved-host allow-list**, with fail-closed empty list under `authoritative`.

### Why not the others for the first pilot

| Option | Why not first |
|--------|----------------|
| A | Estate-wide blast radius on one Hostinger workerset |
| C | Needs schema + ops UI/CLI; heavier than env list |
| D | Extra deployment/DNS cost for a temporary pilot |

### Why B is enough

- Reuses existing mode flag and resolve/catalogue gates.
- No migration.
- Host-only cookies + hostname-bound transfer already align with per-host serve decisions.
- Custom domains remain non-authoritative unless listed — correct for assisted Network onboarding.
- Estate cutover later = explicit `*` (or signed empty→all change after product approval), not an accidental default.

### What B does **not** replace

Shadow evidence, demo personas/content, smoke plan, and approval gates in [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) remain **blocking**. This design only answers **how** to limit blast radius **once** those gates pass.

---

## Verdict

# SMALL IMPLEMENTATION REQUIRED

| Label | Applies? |
|-------|----------|
| EXISTING SUPPORT SUFFICIENT | **No** — global switch cannot restrict to one host |
| **SMALL IMPLEMENTATION REQUIRED** | **Yes** — env allow-list + evaluate/log/tests/docs |
| SEPARATE DEPLOYMENT REQUIRED | **No** (optional later isolation; not required for diagnostic pilot) |
| GLOBAL SWITCH ONLY | **No** for pilot; retain as estate cutover path behind explicit allow-all token |

---

## Implementation sketch (for a follow-up prompt — not done here)

1. Add `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` parser (comma-separated; normalize; support `*`).  
2. In `evaluateTenantRoute` (or thin wrapper): if mode=`authoritative` and host not allow-listed → foundation + reason `authoritative_host_not_allowlisted` (still non-authoritative).  
3. Empty list + authoritative → fail-closed to shadow-equivalent + one warn (pilot-safe).  
4. Log field on authoritative/shadow lines: `allowlistDecision=allow|deny|n/a`.  
5. Tests: on-list render; off-list foundation; custom host denied; `*` estate; empty fail-closed; normalization.  
6. Update env reference, authoritative prerequisites, shadow/cutover runbooks, custom-domain notes.  
7. **Still do not** flip Hostinger mode from the implementation PR alone.

---

## Next implementation prompt (suggested)

```text
73. IMPLEMENT AUTHORITATIVE HOST ALLOW-LIST (PILOT-SAFE)

Read docs/deployment/V5_AUTHORITATIVE_PILOT_ALLOWLIST_DESIGN.md (verdict: SMALL IMPLEMENTATION REQUIRED).

Implement BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST per that design:
- parse/normalize hostnames; support explicit *
- authoritative + empty list → fail-closed (shadow-equivalent), warn once
- authoritative + listed host → existing render_tenant path
- authoritative + resolved tenant not listed → foundation + reason authoritative_host_not_allowlisted
- do not infer from NODE_ENV / org key / Git
- do not enable Hostinger authoritative in this task

Add unit + HTTP tests (on-list, off-list, unknown, custom domain, *, empty).
Update V5_ENVIRONMENT_VARIABLE_REFERENCE.md and cross-links in authoritative prerequisites.

Do not set BLESSBOARD_TENANT_ROUTING_MODE=authoritative in any environment from this work.
```

---

## Suggested documentation commit message

```
docs(deployment): design authoritative pilot host allow-list

Compare global switch vs env allow-list vs domain flag vs separate
deployment; recommend SMALL IMPLEMENTATION for hostname allow-list.
No routing enablement.
```
