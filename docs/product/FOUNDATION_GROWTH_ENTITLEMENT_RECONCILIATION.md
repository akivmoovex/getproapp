# Foundation & Growth — entitlement reconciliation

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Audit + clear wiring/copy fixes only — **no new features**  
**Sources:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · `blessBoardPackageCatalogue.js` · `entitlementService` / `003_blessboard_plans.sql` · `BATCH_FG_*` · HQ/branch nav + report routes

---

## Legend

| Cell | Meaning |
|------|---------|
| Yes | Available / enforced |
| Soft | Limit checked on write; no hard feature flag |
| — | Not sold / not shipped |
| Nav | Nav visibility only (must not be sole protection) |
| Route | HTTP handler gates |
| Service | Service/assert before write or aggregate leak |
| Honest deny | 200 HTML denial without leaking aggregates |

**Plan keys (runtime):** `free` = Foundation · `growth` = Growth · `professional` = Network. User-facing labels must stay Foundation / Growth / Network (not `free` / `professional`).

---

## Feature matrix (retained / shipped vs deferred)

| Feature | Foundation | Growth | Network | Entitlement key | Route enforced | Navigation enforced | Service enforced | Tests |
|---------|:----------:|:------:|:-------:|-----------------|:--------------:|:-------------------:|:----------------:|-------|
| Public website + member portal | Yes | Yes | Yes | (tenant authz) | Yes | Yes | Yes | authz / portal suites |
| Aggregate attendance admin | Yes | Yes | Yes | — | Role | Yes | Authz + policy | attendance tests |
| Aggregate giving admin | Yes | Yes | Yes | — | Role | Yes | Authz + policy | giving tests |
| HQ reports hub (basic aggregates) | Yes | Yes | Yes | `basic_reports` (soft resolve) | HQ role | Yes | Soft tier resolve | reports-audit |
| HQ attendance **detail** report | — | Yes | Yes | `advanced_reports` | **Yes** (deny HTML) | Hub chips (not sole) | Tier resolve before summary | reports-audit |
| HQ giving **detail** report | — | Yes | Yes | `advanced_reports` | **Yes** (deny HTML) | Hub chips (not sole) | Tier resolve before summary | reports-audit |
| `max_branches` capacity | Soft=1 | Unlimited | Unlimited | `max_branches` | N/A (CLI/service) | N/A | **Yes** create/activate/provision/downgrade | platform-entitlements |
| `max_users` / `max_staff_accounts` | Soft | Unlimited | Unlimited | limit keys | N/A | N/A | Soft on role assign | entitlements / HQ roles |
| HQ fixed-role assign/revoke (BB-02) | Yes* | Yes | Yes | Soft seats only | HQ role | Yes (`/hq/roles`) | Seat + authz | hq-roles |
| Custom domain / hosted email | — | — | Yes | `custom_domain` / `custom_email` | Platform/ops | N/A | Fail-closed asserts | platform entitlements |
| Waiting verification | — | — | — | — | — | — | — | Gate stop |
| Departments / duty / monthly reports | — | — | — | — | — | — | — | Gate stop |
| Org / communication templates | — | — | — | — | — | — | — | Gate stop |
| Scheduled reports / communications | — | Catalogue only | — | — | — | — | MISSING_BACKEND | Gate stop |
| Surveys / appointments / volunteers / offline attendance / pastoral cases | — | Catalogue only | — | — | — | — | Deferred | Gate / decision docs |

\*BB-02 classed OPTIONAL GROWTH in priority order; **no** Growth-only plan flag — available to Foundation HQ with soft staff seats (honest).

---

## Verification checklist

| Rule | Result |
|------|--------|
| Foundation cannot access Growth-only **data** via direct URL | **Pass** — `/hq/reports/attendance` and `/giving` return honest deny HTML without aggregates on Foundation |
| Growth receives Foundation features | **Pass** — Growth seed includes `basic_reports` + unlimited caps + `advanced_reports` |
| Network inherits Growth unless different | **Pass** — `professional` has advanced reports + unlimited branches; adds `custom_domain` / `custom_email` |
| Nav hiding is not the only protection | **Pass** for advanced reports (route + tier resolve). Hub **omits** Growth detail hrefs on Foundation; Growth/Network keep entitled links |
| Background jobs enforce entitlement | **N/A** — V5 jobs disabled; no scheduled report/comms workers |
| No upgrade action implying checkout | **Fixed** — denial copy no longer says “Upgrade to Growth”; points to operator + hub |
| No legacy package name leaks to users | **Fixed** — removed user-facing `<code>advanced_reports</code>`; platform-admin may still show plan_key with Network remap |

---

## Defects found

| # | Severity | Issue | Fix |
|---|----------|--------|-----|
| D1 | Medium (honesty) | Denial/hub copy showed technical key `advanced_reports` to HQ users | Removed from `reports.ejs`, `attendance-report.ejs`, `giving-report.ejs` |
| D2 | Medium (checkout implication) | Empty-state body said “Upgrade to Growth” | Reworded to Growth-required + operator enablement; CTA remains “Back to HQ reports” |

### Not defects (documented)

| Item | Notes |
|------|--------|
| Branch admin monthly summaries share `getMonthly*` services | Intentionally **not** gated by `advanced_reports` (operational BA tools ≠ HQ advanced analytics) |
| HQ roles on Foundation | Soft seats only; not a Growth boolean flag |
| Catalogue aspirational flags (`attendance.offline`, `broadcasts.scheduled`, …) | Marketing / deferred — not runtime V5 entitlements |
| Platform-admin `plan_key` values | Remapped to Foundation/Growth/Network labels in plans UI |

---

## Files changed (this reconciliation)

- `views/blessboard/v5/hq/reports.ejs`
- `views/blessboard/v5/hq/attendance-report.ejs`
- `views/blessboard/v5/hq/giving-report.ejs`
- `docs/product/FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md` (this file)

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:platform:entitlements` | **13 pass / 0 fail** |
| `node --test tests/blessboard-hq-roles.test.js` | **10 pass / 0 fail** |
| `node --test tests/blessboard-reports-audit.test.js` | **7 pass / 0 fail** |
| `node --test tests/blessboard-authorization.test.js` | **22 pass / 0 fail** |
| `git diff --check` | **clean** |

---

## Suggested commit

```text
Reconcile Foundation/Growth entitlements; remove checkout-implying report copy.
```
