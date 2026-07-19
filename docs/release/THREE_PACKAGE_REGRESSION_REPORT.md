# Foundation · Growth · Network — three-package regression report

**Date:** 2026-07-19  
**Branch:** `V5` @ `fa36fea` (+ working-tree three-package hardening)  
**Mode:** Non-destructive local regression + documentation only — **no deploy**, no hosted migrate, no env mutation  
**SoT:** [`FOUNDATION_FINAL_READINESS.md`](./FOUNDATION_FINAL_READINESS.md) · [`GROWTH_FINAL_READINESS.md`](./GROWTH_FINAL_READINESS.md) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_COMMERCIAL_COPY_RECONCILIATION.md`](../product/NETWORK_COMMERCIAL_COPY_RECONCILIATION.md) · [`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) · [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

---

## Executive scoreboard (required)

| # | Item | Result |
|---|------|--------|
| 1 | **Total tests** (Node TAP aggregate across executable suites) | **661** |
| 2 | **Passing** | **661** |
| 3 | **Failing** | **0** (product TAP) |
| 4 | **Skipped** | **0** (product TAP) |
| 5 | **Foundation readiness** | **READY WITH MANUAL CHECK** |
| 6 | **Growth readiness** | **READY WITH MANUAL CHECK** |
| 7 | **Network readiness** | **READY WITH MANUAL CHECK** (implemented scope only) |
| 8 | **External-service blockers** | Mailboxes · API · webhooks · integrations · DNS/TLS automation · registrar purchase · support SLA portal (see §8) |
| 9 | **Hosted migrations pending** | **Yes** — B06–B08 / B10; no hosted V4→V5 rehearsal/apply (see §9) |
| 10 | **Suggested commit message** | See §10 |

**Suite gates outside TAP:** `lint:css` **FAILED** (pre-existing stylelint debt — §Verification); legacy `test:church:regression` **NOT RUN** (no `TEST_DATABASE_URL` in this environment — coverage covered by V5 entitlements instead).

**Deploy:** Not performed (per prompt).

---

## Verification battery (this run)

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| V5 full regression (22 npm suites) | `npm run test:blessboard:v5:regression` | **PASS** (~88s) | Auth, sessions, CSRF audits, authz, tenant routing, shells, modules, entitlements, provisioning, catalogue, migration unit/tooling |
| Network executive dashboard | `tests/blessboard-hq-executive-dashboard.test.js` | **3/3** | `executive_reports` |
| Network governance audit | `tests/blessboard-hq-governance-audit.test.js` | **3/3** | `advanced_audit` |
| HQ fixed roles | `tests/blessboard-hq-roles.test.js` | **10/10** | Not advanced custom matrix |
| Pricing honesty | `tests/church-platform-pricing.test.js` | **8/8** | USD 29.99 preserved; Network honesty |
| Commercial catalogue | `tests/church-commercial-catalogue.test.js` | **7/7** | |
| Public FAQ | `tests/church-platform-public-faq.test.js` | **9/9** | Manual DNS / by-arrangement honesty |
| Foundation/Growth a11y | `tests/church-foundation-growth-a11y.test.js` | **12/12** | |
| CSS boundaries | `npm run lint:css-boundaries` | **PASS** | |
| CSS stylelint | `npm run lint:css` | **FAIL** | 1999 problems (**47** errors, **1952** warnings) — **0** errors under `public/blessboard/v5/`; errors in `public/build/assets/styles-*.css` (46) + `public/church/church.css` (2) |
| Legacy church FG regression | `npm run test:church:regression` | **NOT RUN** | Requires `TEST_DATABASE_URL`; script exited immediately |

**TAP aggregate (executable Node suites):** **661** tests · **661** pass · **0** fail · **0** skipped.

---

## Cross-cutting security & platform checks

| Area | Covered by | Result |
|------|------------|--------|
| Authentication | V5 auth schema/HTTP, apex auth GUI, tenant auth | Pass |
| Sessions | `test:platform:sessions` (inside V5 regression) | Pass |
| CSRF | `test:blessboard:csrf-action-audit` + related inventories in regression | Pass |
| Authorization | `test:blessboard:authorization` | Pass |
| Tenant routing | `test:blessboard:tenant-routing` (mode + evaluate) | Pass |
| Branch / church scope | Branch list, HQ shell, content-admin, authz | Pass |
| Package entitlement | `test:platform:entitlements` (Foundation / Growth / Network matrix) | Pass |
| Navigation | HQ/BA shells + Network nav entitlement gating (prior audit) | Pass |
| Accessibility | V5 a11y structure (regression) + FG a11y suite | Pass |
| CSS lint | stylelint + boundaries | Boundaries **pass**; stylelint **fail** (debt, not V5 package logic) |

---

## 1–4. Test totals

| Metric | Value |
|--------|-------|
| Total (TAP) | **661** |
| Passing | **661** |
| Failing | **0** |
| Skipped | **0** |

Supplemental non-TAP outcomes:

| Gate | Classification |
|------|----------------|
| `lint:css` | **Failed gate** (pre-existing CSS debt; no BlessBoard V5 CSS errors) |
| `test:church:regression` | **Environment blocked** (missing dedicated test DB URL) — not counted as product fail |

---

## 5. Foundation readiness

**Verdict: READY WITH MANUAL CHECK**

| Check | Result |
|-------|--------|
| Package limits (`max_branches=1`, seats, soft member cap) | **Pass** — entitlements in V5 regression |
| Active branch capacity | **Pass** — **one active `blessboard.branches` row total** (HQ occupies the slot). *Not* “1 HQ + 1 non-HQ campus”; second active campus blocked |
| No Growth access | **Pass** — `advanced_reports` denied; detail report URLs honest deny |
| No Network access | **Pass** — `custom_domain` / Network flags false |
| Auth / sessions / CSRF / authz / tenant routing / nav | **Pass** (regression) |

Hosted demo personas/CMS remain **READY WITH MANUAL CHECK** (release blockers B02–B04). Authoritative routing / production cutover **BLOCKED** (ops — not Foundation package).

Detail: [`FOUNDATION_FINAL_READINESS.md`](./FOUNDATION_FINAL_READINESS.md).

---

## 6. Growth readiness

**Verdict: READY WITH MANUAL CHECK**

| Check | Result |
|-------|--------|
| Unlimited branches (`max_branches` NULL) | **Pass** |
| Growth operational features (cross-branch HQ, `advanced_reports` attendance/giving) | **Pass** |
| No Network access | **Pass** — `custom_domain` / `custom_email` / API / webhooks / integrations false |
| Catalogue scheduling / surveys / appointments / volunteers / offline | **DEFERRED** — do not sell as live |
| Auth / sessions / CSRF / authz / scope / nav | **Pass** |

Detail: [`GROWTH_FINAL_READINESS.md`](./GROWTH_FINAL_READINESS.md).

---

## 7. Network readiness

**Verdict: READY WITH MANUAL CHECK** for **implemented Network scope**; not ready as full brochure self-serve Network.

| Check | Result |
|-------|--------|
| Inherits Growth | **Pass** — unlimited branches + `advanced_reports` on `professional` |
| Implemented Network features | **Pass** — `custom_domain` (assisted registry + entitlement gate), `executive_reports`, `advanced_audit`, fixed HQ roles |
| Entitlement enforcement | **Pass** — Growth/Foundation denied Network gates; inactive keys remain false (`custom_email`, `advanced_roles`, `report_templates`, `api_access`, `webhooks`, `integrations`; `max_mailboxes_per_branch=0`) |
| Domain workflow | **Assisted / manual DNS-TLS** — not automated ACME; PA registry + provision assert; no tenant self-serve DNS |
| Mailbox requests | **Not live product** — no request GUI / provision path; marketing honesty: by arrangement + external provider |
| Advanced roles | **Fixed roles only** — custom matrix not shipped (`advanced_roles` false) |
| Executive reports | **Live** Network executive dashboard (NW-EX-01); deeper trends/exports still limited |
| Report templates | **Not shipped** (`report_templates` false) |
| API / webhooks / integrations | **Not shipped / not enabled** — fail-closed asserts; commercial copy honest |
| Support / SLA | **Ops arrangement** — no published SLA / support portal |
| External-service limitations honestly represented | **Pass** — pricing/FAQ/features + [`NETWORK_COMMERCIAL_COPY_RECONCILIATION.md`](../product/NETWORK_COMMERCIAL_COPY_RECONCILIATION.md) |

Detail: [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md).

---

## 8. External-service blockers

| ID | Capability | Class | Blocker |
|----|------------|-------|---------|
| B1 | Hosted mailboxes | REQUIRES_EXTERNAL_SERVICE | Mail hosting provider + schema/adapter |
| B2 | Public API | REQUIRES_EXTERNAL_SERVICE | Auth protocol + gateway |
| B3 | Webhooks | REQUIRES_EXTERNAL_SERVICE | Delivery bus + signing |
| B4 | Integrations | REQUIRES_EXTERNAL_SERVICE | Per-vendor / no integration bus |
| B5 | DNS/TLS automation | REQUIRES_EXTERNAL_SERVICE | Explicitly excluded — manual assisted only |
| B6 | Domain registrar purchase | REQUIRES_EXTERNAL_SERVICE | Registrar + billing |
| B11 | Priority support portal / SLA | NOT_SOFTWARE_FEATURE | CRM/ops contract data |

Growth deferred catalogue items (schedulers, surveys, etc.) remain deferred on Network as well.

---

## 9. Hosted migrations pending

| ID | Item | Status |
|----|------|--------|
| B06 | Hosted V4→V5 migration rehearsal / dry-run / apply | **Pending** |
| B07 | Open product mapping decisions (M4–M12) | **Pending** / waive |
| B08 | Media blob copy (metadata-only today) | **Pending** / waive |
| B10 | Estate-wide production cutover preconditions | **Pending** |
| B01 / B05 / B09 | Shadow evidence · authoritative smoke · signed go/no-go | **Pending** (routing gates) |
| B12 | `plan_key` vocabulary migration (`professional` → `network`) | **Pending** product decision |

This regression did **not** apply hosted migrations.

---

## 10. Suggested commit message

```
docs: three-package regression — Foundation, Growth, Network ready with checks

Record local non-destructive regression (661 pass) and package readiness,
including Network entitlement honesty and remaining external-service blockers.
```

---

## Package matrix (runtime)

| Capability | Foundation | Growth | Network |
|------------|------------|--------|---------|
| Price (SoT) | USD 0 | USD 14.99 / active branch | USD 29.99 / active branch |
| Active branches | Max **1** (incl. HQ) | Unlimited | Unlimited |
| Basic reports | Yes | Yes | Yes |
| Advanced reports | No | Yes | Yes (inherited) |
| Executive dashboard | No | No | Yes |
| Governance audit filters | No | No | Yes |
| Custom domain | No | No | Assisted / manual |
| Hosted mailboxes | No | No | External / by arrangement (not live) |
| API / webhooks / integrations | No | No | Not enabled |
| Advanced custom roles | No | No | Not shipped |
| Report templates | No | No | Not shipped |
| Published support SLA | No | No | No |

---

## Stop

Three-package regression complete. **No deploy.** Product TAP green; stylelint debt and hosted migration/routing gates remain outside local package readiness claims.
