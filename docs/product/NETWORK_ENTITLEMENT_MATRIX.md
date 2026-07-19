# Network — entitlement matrix

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Runtime entitlement reconciliation (no plan_key rename; no custom-domain GUI)  
**Sources:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) · `entitlementService.FEATURE_KEYS` · `db/seeds/003_blessboard_plans.sql` · `blessBoardPackageCatalogue.js`

**Companions:** [`FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md`](./FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md)

---

## Rules applied

| Rule | Application |
|------|-------------|
| Network inherits Growth | `basic_reports`, `advanced_reports`, unlimited capacity limits on `professional` / `partner` |
| Foundation / Growth unchanged for shared keys | Same Growth/Foundation values as before for reports + caps |
| Explicit Network-only keys | Declared in `FEATURE_KEYS` + seeded on all plans |
| No package-name checks in routes | Entitlement asserts / `hasFeature` only |
| Legacy plan keys preserved | `free` / `growth` / `professional` / `partner` unchanged |
| No DEFERRED / NOT_SOFTWARE_FEATURE keys | No `priority_support`, managed-services, or Growth deferred catalogue flags in FEATURE_KEYS |
| No advertising without backend | Network-only booleans without a V5 surface stay **false**; mailbox limit stays **0**. Active Network gates: `custom_domain`, `executive_reports`, `advanced_audit` |

---

## Plan key compatibility

| Persisted `plan_key` | Display | Status | Runtime posture |
|----------------------|---------|--------|-----------------|
| `free` | Foundation | active | Foundation limits + basic reports |
| `growth` | Growth | active | Unlimited + advanced reports; Network-only **off** |
| `professional` | Network | active | Growth inheritance + `custom_domain` **on**; other Network-only **off** |
| `partner` | Partner (legacy) | **inactive** | Feature rows **match** `professional` for existing subscriptions |

Package catalogue aliases (`professional` / `partner` → `network`) remain display/commercial only — not FEATURE_KEYS.

---

## FEATURE_KEYS inventory

| Key | Kind | Foundation | Growth | Network (`professional`) | Notes |
|-----|------|:----------:|:------:|:------------------------:|-------|
| `max_branches` | limit | 1 | unlimited | unlimited | Shared |
| `max_users` | limit | 250 | unlimited | unlimited | Shared |
| `max_staff_accounts` | limit | 10 | unlimited | unlimited | Shared |
| `max_mailboxes_per_branch` | limit | 0 | 0 | **0** | Mailbox allowance key; commercial catalogue still lists 5 — **not** live until provider |
| `basic_reports` | boolean | true | true | true | Shared |
| `advanced_reports` | boolean | false | true | true | Growth inheritance |
| `custom_domain` | boolean | false | false | **true** | **Only** active Network-only gate with V5 backend assert |
| `custom_email` | boolean | false | false | **false** | Hosted mailboxes gate reserved; inactive without provider |
| `advanced_roles` | boolean | false | false | **false** | Reserved; fixed roles UI is not this flag |
| `executive_reports` | boolean | false | false | **true** | Network executive dashboard (`/hq/reports/executive`); Growth denied |
| `report_templates` | boolean | false | false | **false** | Reserved; no applicator |
| `api_access` | boolean | false | false | **false** | Reserved; no API surface |
| `webhooks` | boolean | false | false | **false** | Reserved; no delivery bus |
| `integrations` | boolean | false | false | **false** | Reserved; by arrangement |
| `advanced_audit` | boolean | false | false | **true** | Network governance audit (`/hq/audit/governance`); basic `/hq/audit` remains role-based for all packages |

Naming map (prompt → repo):

| Prompt label | Runtime key |
|--------------|-------------|
| custom_domain | `custom_domain` |
| mailbox_allowance | `custom_email` + `max_mailboxes_per_branch` |
| advanced_roles | `advanced_roles` |
| executive_reports | `executive_reports` |
| report_templates | `report_templates` |
| api_access | `api_access` |
| webhooks | `webhooks` |
| integrations | `integrations` |
| advanced_audit | `advanced_audit` |

---

## Inheritance checklist

| Check | Result |
|-------|--------|
| Network has Growth advanced reports | Yes |
| Network has unlimited branches/users/staff | Yes |
| Growth cannot `assertFeature(custom_domain)` | Forbidden |
| Foundation cannot Network-only features | All false / mailbox 0 |
| Inactive subscription | `hasFeature` / `assertFeature` fail closed |
| Org override of `custom_domain` | Scoped to that organization only |
| `partner` feature rows | Equal to `professional` |

---

## Explicitly excluded from FEATURE_KEYS

| Item | Why |
|------|-----|
| Priority support / assisted onboarding | NOT_SOFTWARE_FEATURE |
| Optional managed services | NOT_SOFTWARE_FEATURE |
| Payment / checkout | DEFERRED |
| Surveys, schedules, offline attendance, volunteers, appointments, pastoral engine | DEFERRED (Growth catalogue) |
| Commercial catalogue nested paths (`integrations.webhooks`, `email.mailboxes_per_branch=5`, …) | Marketing / church package catalogue — not platform FEATURE_KEYS |

---

## Enforcement surfaces

| Capability | Entitlement check | Route / service |
|------------|-------------------|-----------------|
| Custom domain insert | `assertFeature(custom_domain)` | `provisionPlatformTenant` |
| Advanced HQ reports | `hasFeature(advanced_reports)` | HQ reports services |
| Branch capacity | `max_branches` | create / activate / assign plan |
| Future Network APIs | Keys exist for fail-closed asserts | **No routes yet** — do not treat false keys as live product |

---

## Suggested verification

```bash
npm run test:platform:entitlements
npm run test:blessboard:catalogue
npm run test:blessboard:authorization
node --test tests/church-package-entitlements.test.js tests/church-commercial-catalogue.test.js
git diff --check
```
