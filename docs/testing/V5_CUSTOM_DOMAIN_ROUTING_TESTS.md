# V5 custom-domain routing tests

**Date:** 2026-07-19  
**Mode:** Automated ephemeral-Postgres HTTP / resolver tests — **no Hostinger env flips, no DNS changes**  
**Companions:** [`NETWORK_CUSTOM_DOMAIN_READINESS.md`](../product/NETWORK_CUSTOM_DOMAIN_READINESS.md) · [`BATCH_NETWORK_CUSTOM_DOMAIN.md`](../gui/BATCH_NETWORK_CUSTOM_DOMAIN.md) · `tests/blessboard-custom-domain-routing.test.js` · `tests/blessboard-tenant-routing.test.js` · `tests/blessboard-tenant-auth.test.js` · `tests/platform-hostname-resolution.test.js`

---

## Purpose

Lock Model A routing/session expectations for:

- BlessBoard fallback subdomain (`*.blessboard.org` / configured base)
- Active `domain_type=custom`
- Active `domain_type=alias` (supported by resolve; no auto-redirect invented)
- Fail-closed paths (inactive / unknown / wrong deployment / wrong env / wrong product)
- Apex authentication transfer bound to the requesting hostname
- Host-only session cookies (no `Domain=.blessboard.org`)
- Suspended church / inactive primary branch on custom hosts

Hostname normalization and uniqueness checks are **not** weakened.

---

## How to run

```bash
# Focused custom-domain suite
node --test --test-concurrency=1 tests/blessboard-custom-domain-routing.test.js

# Bundled with existing tenant routing
npm run test:blessboard:tenant-routing

# Related suites (transfer / sessions / authz / domain resolve)
npm run test:blessboard:tenant-auth
npm run test:platform:sessions
npm run test:blessboard:authorization
npm run test:platform:resolution
```

Requires local disposable Postgres via `tests/helpers/foundationDb` (same as other V5 foundation suites).

---

## Host cases covered

| Case | Host fixture | Expected |
|------|--------------|----------|
| BlessBoard fallback subdomain | `cd-fallback.blessboard.org` (`canonical`) | Authoritative tenant landing |
| Custom domain | `church.custom-domain.test` (`custom`) | Same tenant landing; no org UUID / deployment code leak |
| Alias domain | `www.church.custom-domain.test` (`alias`) | Same tenant landing; **no** invented redirect |
| Inactive custom | same custom, `status=inactive` | **404**; fallback subdomain still works |
| Unknown custom | `unknown.custom-domain.test` | Controlled **404** (no `unknown_domain` leak) |
| Duplicate hostname | second INSERT of existing hostname | Postgres **23505** unique violation |
| Wrong deployment | custom → other deployment code | **404** |
| Wrong environment | org `data_environment` ≠ church | **503** |
| Wrong product | custom row with `getpro` product | **404/503** fail-closed; no tenant shell |
| Login from custom | `GET /login` on custom Host | **303** to apex `/login?tr=` |
| Return from apex | redeem on custom Host | Host-only `Set-Cookie` (no `Domain=`); `/hq` **200** |
| Hostname-bound transfer | redeem code on fallback Host | **400**; redeem on custom still **303** (mismatch does not consume) |
| Cookie host-only | assert `Set-Cookie`; apex Host | No `Domain=`; apex `/hq` not tenant shell |
| Logout on custom | `POST /logout` + CSRF | Session revoked; later `/hq` **303** |
| Switch fallback ↔ custom | separate logins | Distinct SIDs; each Host authorized with its own jar |
| No open redirect | `?next=https://evil…` + `safeTenantNextPath` | Rejected; apex transfer URL has no evil host |
| Suspended church | church `status=suspended` | **503** on custom |
| Inactive primary branch | primary/HQ inactive | **503** on custom |
| Shadow on custom | `BLESSBOARD_TENANT_ROUTING_MODE=shadow` | Foundation HTML only |

---

## Related coverage (pre-existing)

| Suite | Overlap |
|-------|---------|
| `blessboard-tenant-routing.test.js` | Canonical host inactive/unknown/deployment/suspended/primary (same fail-closed family) |
| `blessboard-tenant-auth.test.js` | Transfer TTL, hostname mismatch service, open-redirect helper, logout, cross-tenant **403** |
| `platform-hostname-resolution.test.js` | Resolver custom/alias/inactive/unknown + **duplicate hostname** |
| `platform-v5-sessions.test.js` | Deployment-scoped sessions |
| `blessboard-authorization.test.js` | Role gates on tenant hosts |

---

## Findings (this pass)

| ID | Finding | Severity | Action |
|----|---------|----------|--------|
| F1 | Session tokens are **deployment-scoped**, not hostname-scoped. Manually forwarding a custom-host cookie to the same-org fallback Host can still authorize HQ in-process. | INFORMATIONAL | **No code change.** Browser host-only cookies (no `Domain=`) remain the intended isolation. Documented in tests. Cross-org Host still **403** (existing tenant-auth). |
| F2 | Wrong-product custom domain currently fails as `missing_enrolment` (**503**) before `not_blessboard_tenant` (**404**). | INFORMATIONAL | Accept either as fail-closed; do not weaken checks. |
| F3 | Church `data_environment` cannot diverge from org via church UPDATE (DB trigger). Env mismatch tests must update **organization** (matches existing routing suite). | INFORMATIONAL | Tests aligned; no product defect. |

**Defects requiring fixes:** none in this pass.  
**Safe fixes made:** none (tests + docs + npm script wiring only). Hostname checks unchanged.

---

## Out of scope

- Enabling Hostinger `authoritative` / DNS / TLS
- First-class add-custom-domain service (readiness CD1)
- Routing gate on `verified_at`
- Weakening `normalizeHostname` / uniqueness / transfer hostname bind

---

## Suggested commit message

```
test(blessboard): expand custom-domain routing and transfer coverage

Add ephemeral HTTP cases for fallback/custom/alias hosts, fail-closed
paths, hostname-bound login transfer, and host-only cookies; document
in V5_CUSTOM_DOMAIN_ROUTING_TESTS.md. No DNS or env flips.
```
