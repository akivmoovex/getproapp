# Network — navigation and package gating audit

**Date:** 2026-07-19  
**Branch:** `V5`  
**Prompt:** 56. NETWORK NAVIGATION AND PACKAGE GATING AUDIT  
**Mode:** Audit + fix clear nav/entitlement wiring only — **stop after audit**

**Companions:** [`FOUNDATION_GROWTH_NAVIGATION_AUDIT.md`](./FOUNDATION_GROWTH_NAVIGATION_AUDIT.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md)

---

## Verdict

| Check | Result |
|-------|--------|
| Foundation sees no Growth-only **links** | **Pass** (reports hub gated cards; detail routes soft-deny) |
| Foundation sees no Network-only **links** | **Pass after fix** (was fail: Executive/Governance always in HQ nav + hub/audit deep links) |
| Growth sees no Network-only **links** | **Pass after fix** |
| Network gets Growth links + implemented Network links | **Pass** (`executive_reports`, `advanced_audit` surfaces) |
| Direct route entitlement enforcement | **Pass** (soft deny pages; no summary/catalog without feature) |
| Service-level entitlement enforcement | **Pass** for shipped Network features; inactive FEATURE_KEYS remain false |
| Deferred Network features not presented as active | **Pass** (API/webhooks/integrations/mailboxes absent from nav) |
| External-service / by-arrangement language | **Pass** (apex/pricing; PA honesty; no checkout) |
| Mobile HQ tabs usable | **Pass** (home / branches / reports / account — no Network-only tabs) |
| Dashboard quick actions entitlement-aware | **Pass** (shared Growth modules only; no Executive/API quick actions) |

---

## Package → nav matrix (HQ)

| Nav / action | Foundation | Growth | Network (`professional`) |
|--------------|:----------:|:------:|:------------------------:|
| Core HQ modules (branches, members, reports hub, audit, …) | Yes | Yes | Yes |
| `/hq/reports/attendance` · `/giving` **links** | No (gated card) | Yes | Yes |
| `/hq/reports/executive` **nav + hub link** | No | No | Yes (`executive_reports`) |
| `/hq/audit/governance` **nav + audit CTA** | No | No | Yes (`advanced_audit`) |
| `/hq/roles` (fixed three roles) | Yes | Yes | Yes (`advanced_roles` still **false** — no custom matrix) |
| API / webhooks / integrations / mailboxes | Absent | Absent | Absent (`FEATURE_KEYS` false) |

Branch-admin and member nav have **no** Network-only entries (correct).

---

## Implemented Network surfaces (live)

| Surface | Route | Entitlement | Nav |
|---------|-------|-------------|-----|
| Executive dashboard | `GET /hq/reports/executive` | `executive_reports` | Sidebar when entitled |
| Governance audit | `GET /hq/audit/governance` | `advanced_audit` | Sidebar + audit CTA when entitled |
| Custom domain | PA domains + provision assert | `custom_domain` | Not HQ tenant nav (assisted ops) |

Inactive Network FEATURE_KEYS (must stay out of active nav): `custom_email`, `advanced_roles`, `report_templates`, `api_access`, `webhooks`, `integrations`; mailbox limit **0**.

---

## Defects found and fixed

| ID | Defect | Fix |
|----|--------|-----|
| N-NAV-01 | HQ sidebar always listed **Executive** and **Governance** for every plan | `requiresFeature` on nav items; `buildHqAdminShellLocals` resolves soft entitlements and filters |
| N-NAV-02 | Reports hub always linked Executive | Gated card (`network-required`) unless `entitledFeatures.executive_reports` |
| N-NAV-03 | Basic audit always linked Governance | CTA only when `entitledFeatures.advanced_audit` |

**Files:** `hqAdminNav.js`, `hqAdminShellLocals.js`, HQ routers passing `getPool` into async shell locals, `reports.ejs`, `audit.ejs`, related tests.

---

## Deferred / external features (presentation honesty)

| Feature | Nav / UI treatment | Language |
|---------|-------------------|----------|
| Hosted mailboxes | Absent | By arrangement / provider blocked |
| API access | Absent (catalogue path locked) | By arrangement |
| Webhooks | Absent | By arrangement |
| Integrations registry | Absent | By arrangement |
| Priority support portal | Absent | NOT_SOFTWARE_FEATURE |
| Report templates | Absent | MISSING_BACKEND |
| Advanced roles matrix | Stitch decorative only; live = fixed roles | Assisted / by arrangement |
| Checkout / instant Network activation | None in HQ | Operator assigns plan; no self-serve checkout |

---

## Direct route + service checks

| Path | Foundation / Growth | Network |
|------|---------------------|---------|
| `GET /hq/reports/executive` | 200 deny chrome (`data-bb-exec-entitlement="denied"`) | Live summary |
| `GET /hq/audit/governance` | 200 deny chrome | Live filters |
| `GET /hq/reports/attendance` | Deny without `advanced_reports` | Allow |
| `assertFeature(api_access)` etc. | Forbidden | Still false on Network until product READY |

Dashboard quick actions (desktop/mobile) remain shared operational links only — no Network-only shortcuts invented.

---

## Mobile navigation

| Surface | Tabs | Notes |
|---------|------|-------|
| HQ | home, branches, reports, account | Network Executive/Governance stay in drawer/sidebar when entitled — not bottom tabs |
| Branch admin | Unchanged | No Network items |
| Member | Unchanged | No Network items |

---

## Residual notes (not fixed this pass)

1. **HQ participation** builds locals without `buildHqAdminShellLocals` — shell falls back to a static list that **omits** Executive/Governance (safe). Prefer consolidating later.  
2. **Gate-stop batches** (API, webhooks, integrations, support requests, etc.) remain documentation-only — correctly absent from nav.  
3. Plan key vocabulary remains `professional` in DB with Network display remap elsewhere.

---

## Tests run

All passed:

- `tests/blessboard-hq-executive-dashboard.test.js` — Growth nav omission + Network allow  
- `tests/blessboard-hq-governance-audit.test.js` — Growth nav/CTA omission + Network allow  
- `tests/blessboard-reports-audit.test.js` — Foundation/Growth hub Network gating  
- `tests/blessboard-hq-shell.test.js`  
- `tests/platform-entitlements.test.js`  
- `tests/blessboard-v5-route-link-audit.test.js`  
- `tests/blessboard-v5-a11y-structure.test.js`  
- `git diff --check`

---

## Stop

Audit complete. No further Network feature implementation in this prompt.
