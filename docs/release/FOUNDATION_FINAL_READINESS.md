# Foundation final product readiness

**Date:** 2026-07-19  
**Branch:** `V5` @ `de660d3` (+ working-tree retained Foundation/Growth hardening)  
**Mode:** Audit only — **no features added**  
**Commercial SoT:** [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) · `db/seeds/003_blessboard_plans.sql` · `blessBoardPackageCatalogue.js` · [`FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md`](../product/FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md)

---

## Executive verdict

| Verdict | Detail |
|---------|--------|
| **Overall** | **READY WITH MANUAL CHECK** |
| Local automated Foundation product | **READY** — full V5 regression **22/22** suites passed |
| Hosted / public demo | **READY WITH MANUAL CHECK** — needs demo personas + published CMS (see [`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) B02–B04) |
| Authoritative tenant routing / production cutover | **BLOCKED** (ops/migration gates — out of Foundation package GUI scope) |

Foundation is **demo-ready for approved package capabilities** when run against a seeded local or prepared hosted tenant. It is **not** blocked by missing retained Foundation features. Growth-only advanced analytics remain denied. Deferred Stitch/catalogue items stay absent or honestly disabled.

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **READY** | Approved Foundation capability works; automated evidence; no Growth leak; no pretend actions |
| **READY WITH MANUAL CHECK** | Capability OK in code/tests; live demo needs content, personas, browser, or soft-limit observation |
| **BLOCKED** | Cannot claim ready until an external dependency clears (ops, product unlock, hosted evidence) |
| **DEFERRED** | Intentionally not in Foundation V5 product (or product-gated) |

---

## Approved Foundation package (SoT)

| Item | Approved | Runtime |
|------|----------|---------|
| Price | **USD 0** / month | Plan `free` display **Foundation** |
| HQ | **1** | Provision creates HQ branch |
| Active branches | **Maximum 1** | `max_branches = 1` — **all** active rows counted, **including HQ** |
| Members | Up to **250** | `max_users = 250` (soft — see limits) |
| Admin / leadership | Up to **10** | `max_staff_accounts = 10` on role assign |
| Reporting | **Basic** | HQ hub + BA aggregates; **not** `advanced_reports` |
| Public site + member portal | Yes | Live |
| Advanced workflows / scheduling / cross-branch Growth analytics | — | Not Foundation |

### Branch capacity wording (important)

Pricing marketing: “1 HQ, maximum 1 active branch.”  
Runtime: **one active `blessboard.branches` row total**. After provision, that slot is the HQ branch; a second active campus is blocked. This is **not** “1 HQ + 1 non-HQ campus.” Any change to allow an extra campus requires an explicit SoT change.

---

## Area classifications

| Area | Class | Evidence / note |
|------|-------|-----------------|
| Apex marketing (home, features, pricing, directory, for-churches, register-church enquiry) | **READY** | Apex suites in V5 regression; no checkout |
| Apex / tenant auth (login, transfer, sessions, CSRF) | **READY** | Auth + sessions + authorization suites |
| Tenant public CMS pages | **READY WITH MANUAL CHECK** | Routes/tests OK; demo needs published Home/About |
| Member registration + BA verification queue | **READY** | `/register` → submitted; BA/HQ registration review |
| Waiting-verification session | **DEFERRED** | No pending-member session — `/register/submitted` is the honest end state |
| Forgot password | **DEFERRED** | Product undecided; login omits link |
| Member portal (dashboard, profile, announcements, events, ministries, resources, forms, requests, giving info) | **READY** | Member suite pass; prayer dedicated route absent |
| Member prayer CTA (dedicated tile) | **DEFERRED** | Disabled tile, no dead href; live path = Requests `category=prayer` |
| Branch admin ops (registrations, members, announcements, attendance, giving, CMS, forms, requests, resources, settings) | **READY** | Shell + admin-module suites |
| Branch monthly reports | **DEFERRED** | Dashboard tile disabled: “Monthly reports not available yet” |
| Departments / duty roster | **DEFERRED** | No V5 schema/routes; not in nav |
| HQ dashboard, branches, members, registrations, content, announcements, participation, attendance, giving, forms, resources, requests, settings, account, audit | **READY** | HQ shell + modules; single-branch Foundation |
| HQ `/hq/roles` (fixed HQ/branch admin assign) | **READY** | Retained; soft seats; hq-roles **10/10** |
| HQ reports hub (`basic_reports`) | **READY** | Live aggregates; no fabricated KPIs |
| HQ attendance/giving **detail** | **READY** (Foundation denial) | Direct URL → honest deny, no aggregate leak; hub **no** Growth hrefs on Foundation |
| Package `max_branches` | **READY** | Create / activate / provision insert / Foundation downgrade gated; entitlements **13/13** |
| Package `max_staff_accounts` (10) | **READY** | Soft gate on HQ/CLI role assign |
| Package `max_users` (250) | **READY WITH MANUAL CHECK** | Limit in plan features; checked on staff/user seat path for role assign — **member registration path does not hard-block at 250** (soft honesty gap) |
| Navigation (member / BA / HQ) | **READY** | Enabled routes only; Growth detail links omitted on Foundation; dead tiles honest |
| Direct URL Growth isolation | **READY** | reports-audit Foundation deny |
| No dead / pretend actions | **READY** | Broadcasts/templates/monthly reports absent or disabled with accurate copy |
| Network domain/email | **NOT Foundation** | Fail-closed elsewhere |
| Hosted demo personas + CMS samples | **READY WITH MANUAL CHECK** | Release blockers B02–B04 |
| Shadow / authoritative routing | **BLOCKED** | Release blockers B01, B05, B09 |
| Production migration cutover | **BLOCKED** | Release blockers B06–B08, B10 |

---

## Verification checklist (prompt requirements)

| Check | Result |
|-------|--------|
| Every Foundation route (approved set) | **Pass** — coverage COMPLETE rows + route-link audit; deferred routes absent |
| Package limit enforcement | **Pass** branches + staff seats; **soft** members (see above) |
| One-branch enforcement | **Pass** — second active create/activate blocked on Foundation |
| Navigation | **Pass** — [`FOUNDATION_GROWTH_NAVIGATION_AUDIT.md`](../gui/FOUNDATION_GROWTH_NAVIGATION_AUDIT.md) |
| Direct URL access | **Pass** — Growth detail denied without data leak |
| Public / member / branch / basic HQ workflow | **Pass** (automated) |
| Registration and verification | **Pass** register + BA queue; waiting session **DEFERRED** |
| Reports | **Pass** basic hub; advanced denied |
| Giving and attendance | **Pass** BA + HQ manage aggregates; advanced HQ detail Growth-only |
| Newly retained Foundation features | **Pass** — HQ roles + capacity wiring |
| No Growth-only access | **Pass** |
| No dead or pretend actions | **Pass** |

---

## Tests run (Foundation readiness)

| Command | Result |
|---------|--------|
| `npm run test:blessboard:v5:regression` (full, 22 suites) | **PASSED** in ~89s |
| `npm run test:platform:entitlements` | **13/13** |
| `node --test --test-concurrency=1 tests/blessboard-hq-roles.test.js` | **10/10** |
| Included in regression: authorization, member-suite, attendance, giving, forms-requests, reports-audit, content-admin, public-pages, shells, apex, auth, route-link, a11y, CSRF, provisioning | **Pass** |

**Audit hygiene (not a product feature):** synced `tests/blessboard-v5-frontend-assets.test.js` CSS cache versions (`apex` → `7`, `hqAdmin` → `50`) so precommit matched live shells after prior CSS bumps.

---

## Demo readiness statement

| Demo type | Ready? |
|-----------|--------|
| **Local Foundation walkthrough** (provisioned org, published pages, HQ/BA/member personas) | **Yes** — **READY WITH MANUAL CHECK** for content/personas |
| **Hosted diagnostic demo** without personas/CMS | **No** — prepare B02–B04 first |
| **Sell Foundation as USD 0 / 1 branch / basic reports** | **Yes** — matches SoT and enforcement |
| **Claim Growth advanced analytics on Foundation** | **No** — correctly denied |
| **Claim waiting-verification, monthly BA reports, departments, dedicated prayer route** | **No** — **DEFERRED** / absent |

---

## Residual risks (accepted)

1. **Soft `max_users` on member register** — operators should monitor seat count until a hard gate is approved.  
2. **Stitch MATCHED not claimed** — visual polish residual; capability COMPLETE.  
3. **plan_key vocabulary** (`free` vs Foundation) — display remapped; migration of keys is production cutover work.  
4. **Create-org remains CLI** — platform ops, not Foundation church package.

---

## Stop

Foundation final product audit complete. **No features added.** Next package audits (Growth / Network) are separate prompts.
