# Network — custom domain readiness audit

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Readiness audit only — **no DNS/SSL automation, no env flips, no cookie or routing changes**  
**Sources:** `platform.domains` (`008_domains.sql`) · `resolveHostname` · `evaluateTenantRoute` · `provisionPlatformTenant` · `platformAdminDomains` · PA domains UI · `NETWORK_ENTITLEMENT_MATRIX.md` · `V5_SESSION_COOKIE_AUDIT.md` · `V5_ENVIRONMENT_VARIABLE_REFERENCE.md` · `V5_SHADOW_ROUTING_READINESS.md` · `BATCH_21A/21B` domain docs · pricing SoT

**Companions:** [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_IMPLEMENTATION_QUEUE.md`](../gui/NETWORK_IMPLEMENTATION_QUEUE.md)

---

## Executive conclusion

| Field | Value |
|-------|--------|
| **Recommended model** | **A — Manual DNS + manual SSL** (assisted ops; Hostinger / registrar / reverse-proxy panels) |
| **Verdict** | **BACKEND CHANGES REQUIRED** |
| **Not** | Automated DNS/SSL (C) · Platform DNS verification jobs (B) without a signed design · Authoritative routing flip from this audit |

**Why not “READY FOR MANUAL CUSTOM DOMAIN WORKFLOW” yet:** registry + entitlement + host-only sessions exist, but the assisted path is incomplete for the normal Network case (keep BlessBoard subdomain **and** add a custom host): no first-class add-domain service with audit, `verified_at` is display-only and unused by routing, PA cannot create custom rows, and **customer-facing tenant HTML on a custom host requires `BLESSBOARD_TENANT_ROUTING_MODE=authoritative`** (shadow still serves foundation HTML). Those are product/ops/backend gates — not a DNS API invention.

**Why not EXTERNAL SERVICE REQUIRED for Model A:** registrar DNS and Hostinger TLS are operator-panel work already assumed by pricing (“assisted onboarding”). No new DNS/ACME vendor API is required for A.

**Why not DEFER:** Network `custom_domain` is the only active Network-only FEATURE_KEY with a real assert path; Model A is the approved commercial posture.

---

## Stitch reference

| Surface | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| PA Domains / Settings (adapted) | `30e3856782bd41b6bf14402e1e535cbd` (`67-platform-settings-desktop`) | `efb0fd24f1184968be79083974dcd092` | **No** dedicated custom-domain Stitch pair |
| Tenant custom-domain onboarding | — | — | **MISSING_STITCH** for church-facing domain wizard |

---

## Assessment matrix

| Topic | Current state | Gap for Model A |
|-------|---------------|-----------------|
| **Domain ownership model** | Row in `platform.domains`; unique `hostname`; org FK nullable (required for tenant types) | Ownership = org assignment + enrolment; no customer self-serve claim |
| **Canonical vs alias vs custom** | `domain_type ∈ {canonical, custom, alias, apex}`; tenant resolve treats **canonical / custom / alias** alike | Alias vs custom semantics for redirects **undocumented** in product; no redirect automation |
| **Organization assignment** | PA POST `/admin/domains/:hostname/organization` (CSRF + confirm + deployment-scoped); CLI provision sets org on insert | OK for reassignment; create still CLI |
| **Product assignment** | `product_id` NOT NULL; BlessBoard enrolment required for tenant resolve | Cannot change product via PA domain UI (by design) |
| **Environment / deployment assignment** | `deployment_id` → `platform.deployments.deployment_code`; resolve compares `PLATFORM_DEPLOYMENT_CODE` | Org `data_environment` checked in catalogue, not on domain row |
| **Active / inactive / retired** | Status CHECK; resolve fails closed on non-`active` (`inactive_domain` → 404 in routing eval) | Rollback = set `inactive`/`retired` (supported) |
| **Verification state** | `verified_at` stored; PA shows Verified/Unverified | **Not read by `resolveHostname`** — verification is ops chrome only |
| **DNS instructions** | PA settings shows pattern/reserved labels read-only | **No** per-org CNAME/A instruction sheet or TXT token |
| **SSL responsibility** | Outside app (Hostinger / proxy / CDN) | Must stay external for Model A; do not automate |
| **Fallback BlessBoard subdomain** | Pricing default: `*.blessboard.org` (or configured base) as canonical | Must remain active when custom is added; **add-second-domain path is CLI re-provision only** |
| **Tenant routing compatibility** | Custom resolves as `resolved_tenant` when active + org + enrolment + deployment match | `routing_mode=off` → foundation; `shadow` → foundation HTML + logs; **authoritative** required for live tenant site |
| **Logout / login-transfer** | Apex ↔ tenant transfer; hostname-bound tokens; no shared parent Domain cookie | Compatible with custom hosts **if** transfer `requested_hostname` is the custom host |
| **Cookie scope** | Host-only session cookie (no `Domain=.blessboard.org`) | Compatible; custom host gets its own cookie — **do not change** |
| **Unknown-host rejection** | `UNKNOWN_DOMAIN` / invalid → not_found in routing eval | OK |
| **Domain removal / rollback** | Status → inactive/retired; hostname UNIQUE prevents reuse until row strategy defined | No hard DELETE UI; retired rows may block hostname reuse — ops procedure needed |
| **Audit logging** | Domain status/org mutations: **no** `platform.audit_events` write in `platformAdminDomains` | **Gap** for assisted Network ops |
| **Entitlement enforcement** | `assertFeature(custom_domain)` on BlessBoard **custom** insert in `provisionPlatformTenant`; Network plan `true` | Not re-checked on PA status/org mutations; Growth/Foundation correctly denied on insert |

---

## Model comparison

### A. Manual DNS and manual SSL (recommended)

| Aspect | Fit |
|--------|-----|
| Registrar | Customer or ops sets CNAME/A to Hostinger target |
| TLS | Hostinger / reverse-proxy certificate for custom hostname |
| Platform | Insert `domain_type=custom` + org + product + deployment; keep canonical subdomain |
| Entitlement | Network `custom_domain` before insert |
| Routing | Authoritative only when ready to serve tenant HTML |
| Risk | Ops error (wrong DNS, missing TLS, wrong org) — mitigated by runbook + confirmations |

**Matches** pricing: assisted onboarding; not self-service DNS.

### B. Manual DNS with platform verification

| Aspect | Fit |
|--------|-----|
| Extra | TXT/HTTP challenge; job or operator action sets `verified_at` |
| Today | Column exists; **no** challenge generator, checker, or routing gate on `verified_at` |
| Value | Safer before activating custom host |
| Cost | Backend design + optional worker (jobs disabled on V5 foundation) |

**Not smallest safe** until product decides verification gates routing.

### C. Automated DNS/SSL provisioning

| Aspect | Fit |
|--------|-----|
| Needs | DNS provider API + ACME/CA + secrets vault |
| Today | Explicitly excluded (Network blocked B5/B6) |
| Risk | High; invents vendors |

**Defer indefinitely** relative to Model A.

---

## Routing / session / Hostinger notes (do not change from this audit)

| Control | Evidence | Implication for custom domains |
|---------|----------|--------------------------------|
| Host-only cookies | `v5SessionCookie.js` — no `domain` option | Login on custom host ≠ apex cookie; transfer required |
| Transfer | Hostname-bound, ≤5m, single-use | Works for custom hostnames when redeem targets that host |
| Unknown host | `resolveHostname` → `unknown_domain` | Safe reject |
| Shadow | Still `FOUNDATION` HTML | Custom host does **not** show church site in shadow |
| Authoritative | Serves tenant when resolve + catalogue OK | Required for customer-facing custom domain |
| Hostinger env | `PLATFORM_DEPLOYMENT_CODE`, identity, `BASE_DOMAIN`, jobs off | Custom hostname must also terminate TLS on the same app |

**This audit does not enable authoritative routing.**

---

## Exact blockers (ranked)

| ID | Blocker | Class | Blocks |
|----|---------|-------|--------|
| CD1 | No first-class **add custom domain to existing org** service (only `provisionPlatformTenant` insert path; plan must already be Network) | BACKEND | Normal assisted onboarding after canonical provision |
| CD2 | No **audit events** on domain status / org assignment | BACKEND | Ops accountability / Network downgrade trail |
| CD3 | No **ops runbook** (DNS records, TLS steps, activate order, rollback, keep canonical) | DOCS / OPS | Safe Model A execution |
| CD4 | **`verified_at` unused** by resolver; no manual “mark verified” mutation | BACKEND (optional for A) | Model B; honesty of Verified chip |
| CD5 | PA **cannot create** custom domain rows | MISSING_GUI | Optional; CLI may suffice if CD1 exists |
| CD6 | Customer-facing site needs **authoritative** tenant routing + Hostinger vhost/TLS for custom host | OPS / RELEASE | Live traffic (not Model A registry alone) |
| CD7 | Alias vs custom **redirect policy** undefined | PRODUCT | Avoid duplicate content / wrong primary |
| CD8 | DNS/SSL **automation** | EXTERNAL | Model C only — out of scope |

---

## Recommended implementation batch

### NW-CD-01 — Assisted custom domain (Model A) vertical slice

**Goal:** Smallest safe assisted workflow **without** DNS/SSL automation or routing flips.

| Layer | Scope |
|-------|--------|
| 1. Service | `addBlessBoardCustomDomain` (or equivalent): assert `custom_domain`, insert `domain_type=custom`, same org/product/deployment as existing canonical, **not** primary by default; fail on hostname conflict |
| 2. CLI | Thin wrapper; password-free; requires Network entitlement |
| 3. Audit | `domain.created` / `domain.status_changed` / `domain.organization_assigned` on `platform.audit_events` |
| 4. PA | Optional: link from org detail + entitlement-aware unavailable state (NW-Q02 chrome); **no** Force Verify / Buy Domain |
| 5. Docs | Operator runbook: assign Network → add custom row → customer DNS → Hostinger TLS → set status active → keep canonical → rollback inactive |
| 6. Tests | Entitlement deny Growth/Foundation; Network allow; deployment scope; unknown host; no cookie Domain attribute regressions |
| 7. Explicit non-goals | ACME, DNS provider APIs, authoritative enable, cookie Domain changes, `verified_at` gating (unless product elevates to Model B later) |

**Entry criteria:** Network entitlement matrix accepted (`custom_domain` true on Network).  
**Exit criteria:** Ops can add custom host beside canonical under Network; audit trail present; runbook reviewed; tests green.  
**Follow-on (separate):** CD6 authoritative pilot for a single Network demo host; optional Model B verification design.

---

## Verdict checklist (prompt options)

| Option | Selected? | Reason |
|--------|:---------:|--------|
| READY FOR MANUAL CUSTOM DOMAIN WORKFLOW | No | CD1–CD3 / CD6 still open for safe assisted + live serve |
| **BACKEND CHANGES REQUIRED** | **Yes** | CD1–CD2 (+ optional CD4/CD5); NW-CD-01 |
| EXTERNAL SERVICE REQUIRED | No for Model A | Yes only if elevating to B/C automation |
| DEFER | No | Network SoT already sells assisted custom domain |

---

## Stop

Audit complete. No DNS/SSL automation, no cookie changes, no authoritative enable from this prompt.
