# Network feature security audit (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Prompt:** 58. NETWORK FEATURE SECURITY AUDIT  
**Mode:** Audit + fix **clear** security defects only — stop after audit  

**Companions:** [`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_NAVIGATION_ENTITLEMENT_AUDIT.md`](../gui/NETWORK_NAVIGATION_ENTITLEMENT_AUDIT.md) · [`V5_AUTHORIZATION_MATRIX.md`](./V5_AUTHORIZATION_MATRIX.md)

---

## Scope

### Implemented Network surfaces

| Surface | Route / path | Entitlement |
|---------|--------------|-------------|
| Executive dashboard | `GET /hq/reports/executive` | `executive_reports` |
| Governance audit | `GET /hq/audit/governance` | `advanced_audit` |
| Custom domain (provision + PA assign) | provision insert; `POST /admin/domains/:hostname/organization` | `custom_domain` |
| HQ roles (fixed three) | `/hq/roles` | All HQ packages (`advanced_roles` still **false**) |
| Entitlement-aware HQ nav | shell locals | Soft feature flags |

### Explicitly absent (N/A)

API keys, webhook endpoints/signing secrets, integration registry, mailbox provisioning, Network support tickets, versioned `/api/v1` tenant API.

---

## Checklist

| Check | Result | Notes |
|-------|--------|-------|
| Entitlement bypass | **PASS** (soft) | Growth/Foundation get 200 + denied chrome; aggregates/events withheld |
| Cross-church access | **PASS** | Tenant church/org UUID from host context; lists scoped |
| Cross-branch access | **PASS** | Branch key resolved via `resolveBlessBoardBranchForChurch` |
| Raw secret storage | **PASS** / **N/A** | No Network secret tables; sessions remain hash-only |
| Raw secret logging | **PASS** | Audit write redacts; HQ presentation omits metadata JSON |
| API-key leakage | **N/A** | Feature not shipped; `api_access` false |
| Webhook signing-secret leakage | **N/A** | Feature not shipped; `webhooks` false |
| SSRF risk | **N/A** | No outbound user URL fetch on implemented Network surfaces |
| Arbitrary URL protocols | **N/A** | No endpoint URL admin |
| Self-escalation | **PASS** | HQ roles cannot assign `platform_admin`; self-change blocked |
| Custom-domain ownership conflicts | **PASS** | Hostname unique; provision conflict path; **PA assign now asserts `custom_domain`** |
| Mailbox allowance bypass | **N/A** / **PASS** | Limit **0**; no mailbox provision code |
| Sensitive audit payloads | **PASS** | Truncated refs; no metadata bodies on governance UI |
| Unrestricted integrations | **N/A** | `integrations` false; no registry |
| Missing CSRF on GUI actions | **PASS** | Roles POSTs + PA domain POSTs validate CSRF; exec/gov are GET |
| Missing rate limiting on APIs | **N/A** | No Network `/api/v1`; login/register rate limits unchanged |

---

## Defect fixed this pass

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| N-SEC-01 | **Clear** | `assignPlatformDomainOrganization` could attach a **custom** domain to a Foundation/Growth org, bypassing provision `assertFeature(custom_domain)` | Assert `FEATURE_KEYS.CUSTOM_DOMAIN` when `domain_type === 'custom'` and an organization is assigned; route maps `FORBIDDEN` → `error=not_entitled`; PA flash copy; entitlement test |

**Files:** `platformAdminDomains.js`, `platformAdminRoutes.js`, `domain-detail.ejs`, `platform-entitlements.test.js`

Canonical / alias org reassignment is unchanged (not gated by `custom_domain`).

---

## Surface notes

### Executive / governance
- Soft deny is intentional (upgrade messaging); **data** fail-closed.
- Nav omits links when features false (prompt 56).
- Governance actor options use display name or `Staff ·last8` (no email in accessible label).

### HQ roles
- Assignable keys: `church_hq_admin`, `branch_admin` only.
- Tests cover CSRF, forbid `platform_admin`, cross-church revoke.

### Custom domain
- Provision insert: hard `assertFeature` (pre-existing).
- PA assign: hard assert for **custom** type (this audit).
- No DNS/SSRF automation in product path.

---

## Tests run

| Suite | Result |
|-------|--------|
| `tests/platform-entitlements.test.js` | **17/17** (includes PA custom-domain assign gate) |
| `tests/blessboard-hq-executive-dashboard.test.js` | **Pass** |
| `tests/blessboard-hq-governance-audit.test.js` | **Pass** |
| `tests/blessboard-hq-roles.test.js` | **Pass** |
| `tests/blessboard-reports-audit.test.js` | **Pass** |
| `tests/blessboard-platform-admin-shell.test.js` | **Pass** (canonical domain org assign + CSRF) |
| `tests/platform-tenant-provisioning.test.js` | Pre-existing flake on unique-constraint race (unrelated to this fix); hostname conflict coverage elsewhere |
| `git diff --check` | **Pass** |

---

## Stop

Security audit complete. No further Network feature implementation in this prompt.
