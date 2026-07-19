# BlessBoard V5 — Tenant resolution integrity audit

**Date:** 2026-07-19  
**Constraint:** Audit + clear integrity fixes only. **Do not** enable shadow or authoritative routing. **Do not** change env vars or hosted mappings.  
**Companions:** [`V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md) · [`V5_SESSION_COOKIE_AUDIT.md`](./V5_SESSION_COOKIE_AUDIT.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Hostname normalization deterministic? | **YES** |
| Unknown host never maps to another tenant? | **YES** |
| Inactive domain / org / enrolment / church fail closed? | **YES** |
| Org↔church `data_environment` match enforced at resolve time? | **YES** (fixed this pass) |
| No `public.tenants` / `GETPRO_DATABASE_URL` fallback? | **YES** |
| Shadow cannot alter public CMS HTML? | **YES** |
| Authoritative gated by `BLESSBOARD_TENANT_ROUTING_MODE`? | **YES** (default `off`) |
| Routing mode changed this pass? | **NO** |

---

## 2. Resolution chain verified

```
Host header
  → platform/host.js#resolveHostname (strip port, lowercase)
  → platform/hostname.js#normalizeHostname (trim, trailing-dot, reject URL/path/port)
  → domainRepository.findDomainContextByHostname (platform.domains exact match)
  → resolveHostname service (domain/deploy/product/org/enrolment gates)
  → getBlessBoardCatalogueContext (church + env match + HQ + primary)
  → evaluateTenantRoute (off | shadow | authoritative)
```

| Control | Status |
|---------|--------|
| Deterministic normalization | **PASS** |
| Ports stripped at HTTP layer; raw `host:port` rejected by normalizer | **PASS** |
| Uppercase + trailing-dot intentional | **PASS** |
| Unknown → `unknown_domain` only | **PASS** |
| Inactive domain not authoritative | **PASS** |
| Org exists + active | **PASS** |
| Enrolment active | **PASS** |
| Church maps to org | **PASS** (SQL join + uniqueness) |
| Org/church environments match | **PASS** (runtime + DB trigger on church writes) |
| HQ/primary belong to church | **PASS** (join on `church_id`) |
| Inactive/suspended church respected | **PASS** (`status !== active`) |
| No `public.tenants` | **PASS** |
| No `GETPRO_DATABASE_URL` | **PASS** |
| Diagnostic logs no secrets | **PASS** |
| Shadow public HTML = foundation | **PASS** |
| Authoritative config-gated | **PASS** |

---

## 3. Defect found and fixed

| Issue | Fix |
|-------|-----|
| Catalogue loaded org + church `data_environment` but never compared; org UPDATE could diverge from church while resolution still returned `ok` | Fail closed with `environment_mismatch` → authoritative **503** / shadow foundation |

Files: `getBlessBoardCatalogueContext.js`, `loadBlessBoardCatalogueContext.js`, `evaluateTenantRoute.js`.

---

## 4. Edge cases tested (added this pass)

| Case | Suite |
|------|-------|
| Suspended church | catalogue lookup + tenant-routing HTTP |
| Org/church env mismatch | catalogue + evaluateTenantRoute + HTTP 503 |
| Inactive primary branch | catalogue + HTTP |
| Host uppercase / trailing dot / `:443` / `:8080` | tenant-routing HTTP |
| Unknown host no fallthrough | tenant-routing HTTP |
| `environment_mismatch` → 503 policy | tenant-routing-mode |

Already covered: inactive domain/product/org/enrolment/church, missing church/HQ, deployment mismatch, shadow foundation, secrets in logs, no `public.tenants`.

---

## 5. Remaining data / operator prerequisites

(Does **not** block this audit; blocks later shadow flip.)

1. Demo hostname row active on `blessboard-org-v5` (see shadow readiness: `diagnostic.blessboard.org`)
2. Org + church + HQ + primary **active**, environments aligned (`testing`)
3. Hostinger `DATABASE_URL` = V5 only; `GETPRO_DATABASE_URL` unset
4. Prefer `PLATFORM_HOST_CONTEXT_MODE=diagnostic` when observing
5. Leave `BLESSBOARD_TENANT_ROUTING_MODE` unset/`off` until operator flip

**Operator caveat:** In shadow, public CMS stays foundation, but `proposedTenant` can feed login/authz helpers — observational for public HTML only.

---

## 6. GO / NO-GO for later shadow-mode manual execution

| Decision | **GO** (code integrity) |
|----------|-------------------------|
| Meaning | Resolution chain fail-closed; env match enforced; tests green; mode remains **off** in this pass. |
| Still required before flip | Hosted demo mapping + env checklist in `V5_SHADOW_ROUTING_READINESS.md`; operator confirms DNS/Hostinger. |
| Not GO | Authoritative cutover / full E2E content readiness |

---

## 7. Suggested commit message

```
Enforce org/church environment match in V5 tenant resolution and document integrity.
```
