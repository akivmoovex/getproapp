# Network — implementation handover

**Prepared:** 2026-07-19 (Asia/Jerusalem)  
**Branch:** `V5` (tracks `origin/V5`)  
**HEAD (committed):** `fa36fea` — *New screens implementation* (2026-07-19 16:23 +0300)  
**Working tree:** **dirty** — Network program (features, entitlements, security, commercial honesty, docs) is **largely uncommitted** (see §17)  
**Mode:** Handover documentation only  
**Constraint:** No deploy · no hosted data writes · **no further implementation after this handover**

**Companions:**  
[`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) ·  
[`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md) ·  
[`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) ·  
[`NETWORK_COMMERCIAL_COPY_RECONCILIATION.md`](../product/NETWORK_COMMERCIAL_COPY_RECONCILIATION.md) ·  
[`NETWORK_FEATURE_SECURITY_AUDIT.md`](../security/NETWORK_FEATURE_SECURITY_AUDIT.md) ·  
[`THREE_PACKAGE_REGRESSION_REPORT.md`](../release/THREE_PACKAGE_REGRESSION_REPORT.md) ·  
[`FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md) ·  
[`GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md) ·  
[`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) ·  
[`FOUNDATION_GROWTH_FINAL_IMPLEMENTATION_HANDOVER.md`](./FOUNDATION_GROWTH_FINAL_IMPLEMENTATION_HANDOVER.md)

---

## Executive status

| Package | Local product (implemented scope) | Hosted demo | Cutover |
|---------|-----------------------------------|-------------|---------|
| **Foundation** | **READY WITH MANUAL CHECK** | Needs B02–B04 | **BLOCKED** (B01, B05–B10, B12) |
| **Growth** | **READY WITH MANUAL CHECK** | Needs B02–B04 | Same |
| **Network** | **READY WITH MANUAL CHECK** | Needs B02–B04 + Network plan assign | Same + external-service blockers |

**Local automated gate (prompt 60):** TAP **661** pass / **0** fail / **0** skipped · V5 regression **22/22** · Network executive/governance/roles + commercial honesty green. `lint:css` remains a pre-existing fail (0 errors under `public/blessboard/v5/`).

**Commercial SoT preserved:** Network **USD 29.99** / active branch / month · custom-domain and mailbox Network-only positioning · Foundation/Growth copy preserved.

---

## Cursor avoidance confirmation (explicit)

| Action | Avoided? |
|--------|:--------:|
| Deployment | **Yes** |
| Hosted migrations | **Yes** |
| DNS changes | **Yes** |
| SSL / certificate changes | **Yes** |
| Mailbox provisioning | **Yes** |
| External API calls (vendor/provider) | **Yes** |
| Environment-variable changes | **Yes** |
| Routing-mode changes (`BLESSBOARD_TENANT_ROUTING_MODE`) | **Yes** |

---

## 1. Network features implemented

| Feature | Surface | Entitlement | Notes |
|---------|---------|-------------|--------|
| Growth inheritance | Shared V5 HQ/BA/member/public | Unlimited + `advanced_reports` on `professional` | Same as Growth |
| Unlimited active branches | Create/activate services | `max_branches` NULL | HQ create-branch GUI still absent |
| Custom domain **registry + entitlement gate** | PA `/admin/domains*`; provision custom insert | `custom_domain` **true** | Assisted ops — not self-serve DNS |
| Executive dashboard | `GET /hq/reports/executive` | `executive_reports` **true** | NW-EX-01; soft deny for non-Network |
| Governance audit | `GET /hq/audit/governance` | `advanced_audit` **true** | NW-GOV-01; filters; no raw metadata dump |
| Entitlement-aware HQ nav | Sidebar + reports hub + audit CTA | Feature flags on shell locals | Growth omits Network links |
| HQ fixed roles (shared) | `/hq/roles` | Soft seats; **not** `advanced_roles` | Fixed three roles only |
| PA plan/entitlement honesty | Org detail / plans | Shows Network FEATURE_KEYS | Assisted activation posture |
| Commercial honesty | `/pricing`, `/features`, FAQ, SEO | Display SoT | Implemented vs assisted vs deferred language |

Runtime plan key remains **`professional`** (display **Network**). Legacy inactive **`partner`** mirrors Network feature rows.

---

## 2. Network features manual-only

| Feature | Operator action | Product does **not** automate |
|---------|-----------------|-------------------------------|
| Custom organization domain | Registrar + DNS records + TLS cert on host / reverse proxy | ACME, DNS provider API, “verify domain” jobs |
| Domain org assignment | PA assign + Network entitlement | Tenant HQ self-serve domain UI |
| Network package activation | Ops/PA plan assign (`professional`) | Public checkout / self-serve upgrade |
| Priority / assisted onboarding | Human ops | Support portal / SLA clock |
| Executive exports beyond live snapshot | Ops/by arrangement | Self-serve export packs / hierarchy |

---

## 3. External-provider features

| Feature | Runtime | Blocker |
|---------|---------|---------|
| Hosted mailboxes (catalogue ≤5 / branch) | `custom_email` **false**; `max_mailboxes_per_branch` **0** | Mail hosting provider + schema/adapter |
| Public API access | `api_access` **false** | Auth protocol + gateway |
| Webhooks | `webhooks` **false** | Delivery bus + signing secrets + jobs |
| Third-party integrations | `integrations` **false** | Per-vendor / no integration bus |
| DNS/TLS automation | Excluded | DNS provider + ACME/CA |
| Domain registrar purchase | Absent | Registrar API + billing |
| Priority support desk | NOT_SOFTWARE_FEATURE | CRM / contract SLA data |

Design/decision docs exist (API, webhooks, mailbox) — **no live provider wiring**.

---

## 4. Deferred features

| Item | Status |
|------|--------|
| Advanced custom role matrix | PRODUCT_DECISION — `advanced_roles` false |
| Custom report templates / builder | MISSING_BACKEND — `report_templates` false |
| Network executive hierarchy UI | MISSING_BACKEND |
| Executive trends / file exports beyond NW-EX-01 | Blocked / by arrangement |
| Mailbox request GUI | Gate-stopped (BATCH_NETWORK_MAILBOX_REQUESTS) |
| API clients / v1 resources / webhooks admin / delivery | Gate-stopped (batch docs NOT STARTED) |
| Integration registry | Gate-stopped |
| Support request portal | Gate-stopped / NOT_SOFTWARE_FEATURE |
| Payment / Network checkout | DEFERRED (pricing SoT non-goal) |
| Growth catalogue aspirational on Network (surveys, schedules, offline, volunteers, appointments, pastoral engine) | DEFERRED |
| `plan_key` rename `professional` → `network` | PRODUCT_DECISION (release B12) |

---

## 5. Migrations created but not hosted

**Network program did not add new migration files.**

| Artifact | Local | Hosted apply |
|----------|-------|--------------|
| Existing `platform/008_domains.sql` | In repo | **Not applied by this program** |
| Existing `platform/013_create_plans_subscriptions_entitlements.sql` | In repo | **Not applied by this program** |
| Seed `db/seeds/003_blessboard_plans.sql` (Network FEATURE_KEYS rows) | **Modified locally (uncommitted)** | **Not applied to hosted** |
| New mailbox / API / webhook / roles-matrix tables | **None** | N/A |

Hosted V4→V5 migration rehearsal/apply remains release blockers **B06–B08 / B10** — untouched.

---

## 6. Routes added

| Method | Path | Authz | Entitlement |
|--------|------|-------|-------------|
| `GET` | `/hq/reports/executive` | HQ | `executive_reports` (soft deny chrome) |
| `GET` | `/hq/audit/governance` | HQ | `advanced_audit` (soft deny chrome) |

**Hardened (not new):**

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/admin/domains/:hostname/organization` | Assert `custom_domain` when assigning **custom** domain (N-SEC-01) |

**Unchanged / pre-existing Network-adjacent:** `/admin/domains`, `/admin/domains/:hostname`, `/hq/roles`, `/hq/reports`, `/hq/audit`, Growth advanced report detail routes.

**Not added:** `/hq/integrations/*`, mailbox routes, support portal, report-template builder, `/api/v1/*`.

**Views:** `views/blessboard/v5/hq/executive-dashboard.ejs`, `governance-audit.ejs` (+ hub/nav/PA/apex honesty updates).

---

## 7. Entitlements added

Declared in `FEATURE_KEYS` + seeded on plans (`003_blessboard_plans.sql` / entitlement service):

| Key | Foundation | Growth | Network (`professional`) |
|-----|:----------:|:------:|:------------------------:|
| `custom_domain` | false | false | **true** |
| `executive_reports` | false | false | **true** |
| `advanced_audit` | false | false | **true** |
| `custom_email` | false | false | **false** |
| `advanced_roles` | false | false | **false** |
| `report_templates` | false | false | **false** |
| `api_access` | false | false | **false** |
| `webhooks` | false | false | **false** |
| `integrations` | false | false | **false** |
| `max_mailboxes_per_branch` | 0 | 0 | **0** |

Inherited Growth keys unchanged: unlimited caps + `basic_reports` / `advanced_reports` **true** on Network.

Enforcement: `assertFeature` / `hasFeature` only — **no** package-name checks in routes. Detail: [`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md).

---

## 8. Security controls

| Control | Status |
|---------|--------|
| Entitlement fail-closed for inactive Network keys | Pass |
| Soft deny (no data leak) on executive/governance for Growth/Foundation | Pass |
| Church/org scope from host context | Pass |
| Branch resolution church-scoped | Pass |
| PA custom-domain org assign gated (N-SEC-01) | Pass |
| Provision custom-domain insert gated | Pass |
| CSRF on HQ roles + PA domain mutations | Pass |
| Governance UI omits raw audit metadata / emails in actor labels | Pass |
| HQ roles cannot assign `platform_admin`; self-change blocked | Pass |
| No Network API keys / webhook secrets / mailbox credentials in product | N/A (not shipped) |
| No outbound SSRF URL fetch on shipped Network surfaces | Pass / N/A |

Source: [`NETWORK_FEATURE_SECURITY_AUDIT.md`](../security/NETWORK_FEATURE_SECURITY_AUDIT.md).

---

## 9. Tests and results

From [`THREE_PACKAGE_REGRESSION_REPORT.md`](../release/THREE_PACKAGE_REGRESSION_REPORT.md) (2026-07-19):

| Suite | Result |
|-------|--------|
| `npm run test:blessboard:v5:regression` (22 suites) | **PASS** (~88s) |
| `tests/blessboard-hq-executive-dashboard.test.js` | **3/3** |
| `tests/blessboard-hq-governance-audit.test.js` | **3/3** |
| `tests/blessboard-hq-roles.test.js` | **10/10** |
| `tests/church-platform-pricing.test.js` | **8/8** |
| `tests/church-commercial-catalogue.test.js` | **7/7** |
| `tests/church-platform-public-faq.test.js` | **9/9** |
| `tests/church-foundation-growth-a11y.test.js` | **12/12** |
| `npm run lint:css-boundaries` | **PASS** |
| `npm run lint:css` | **FAIL** (pre-existing; 0 BlessBoard V5 CSS errors) |
| `npm run test:church:regression` | **NOT RUN** (no `TEST_DATABASE_URL`) |

**TAP aggregate:** **661** pass · **0** fail · **0** skipped.

Network-focused entitlements also covered inside V5 regression via `test:platform:entitlements` (includes Network flags + PA custom-domain assign).

---

## 10. Foundation compatibility

| Check | Result |
|-------|--------|
| Foundation limits unchanged (`max_branches=1` incl. HQ) | Preserved |
| No Network nav links | Pass |
| Direct executive/governance → soft deny, no aggregates | Pass |
| `custom_domain` assert forbidden | Pass |
| Marketing Foundation claims unchanged | Pass |

Foundation remains **READY WITH MANUAL CHECK** for approved scope.

---

## 11. Growth compatibility

| Check | Result |
|-------|--------|
| Unlimited branches + `advanced_reports` retained | Pass |
| Network-only keys stay **false** | Pass |
| No Network sidebar / hub CTAs when not entitled | Pass |
| Custom domain assign/provision denied | Pass |
| Deferred Growth catalogue items still deferred on Network | Pass |

Growth remains **READY WITH MANUAL CHECK** for implemented scope (not full brochure scheduling).

---

## 12. Network readiness

**Verdict: READY WITH MANUAL CHECK** for **implemented Network scope**.

| Ready to demo locally | Not ready to sell as self-serve |
|-----------------------|----------------------------------|
| Growth inheritance + unlimited campuses | Automated DNS/TLS |
| Executive dashboard + governance audit | Hosted mailboxes |
| Assisted custom-domain registry (PA/ops) | API / webhooks / integrations |
| Fixed HQ roles + entitlement nav | Advanced custom roles / report templates |
| Honest pricing/FAQ/features | Published SLA / checkout |

Overall cutover / authoritative routing still **BLOCKED** by release blockers (not Network-GUI-specific).

---

## 13. Demo-data requirements

Same as Foundation/Growth hosted demo gates (**B02–B04**), plus Network:

| Requirement | Why |
|-------------|-----|
| Platform admin + HQ + BA + member personas on demo tenant | Smoke all shells |
| Published Home/About CMS | Public tenant pages |
| Sample operational rows (announcements, attendance, giving, …) | Executive aggregates meaningful |
| Organization on plan_key **`professional`** (display Network) | Entitled Network surfaces |
| Optional: Network org with **no** custom domain + one with registry row | Demonstrate assisted domain vs entitlement |

Do **not** use `church:seed-demos` for hosted personas (ops scripts/UI only).

---

## 14. Environment requirements

| Item | Requirement |
|------|-------------|
| Local Postgres / app DATABASE_URL | For V5 regression & entitlement tests |
| `SESSION_SECRET` ≥ 32 | Sessions |
| `BLESSBOARD_TENANT_ROUTING_MODE` | Remain **`off`** until shadow runbook (this program did not change it) |
| Hosted Hostinger pairing | Operator confirm before any routing flip (B11) — not done here |
| `TEST_DATABASE_URL` | Needed only for legacy `test:church:regression` (optional) |
| No mailbox/API provider secrets | None required — features inactive |

---

## 15. Required supervised actions

1. **Commit or split PRs** for dirty Network (+ residual FG) working tree on `V5`.  
2. Apply **local** seed / plan feature rows for Network FEATURE_KEYS where DB not yet refreshed.  
3. Hosted: demo personas + CMS (**B02–B04**); assign Network plan for Network demo.  
4. Shadow evidence pack (**B01**); keep routing mode off until approved.  
5. Hosted migration rehearsal (**B06–B08**) before production cutover.  
6. Product go/no-go: elevate external providers (mail/API/webhooks) **or** keep by-arrangement forever; decide `plan_key` rename (**B12**).  
7. Manual DNS/TLS for any real custom domain (ops runbook — not product automation).  
8. Optional: clear stylelint debt (`lint:css`) — not a Network product blocker.

---

## 16. Actions not performed

- Deployment / Hostinger restart  
- Hosted migration dry-run or apply  
- DNS or SSL certificate changes  
- Mailbox provisioning or provider signup  
- External vendor API calls  
- `.env` / environment-variable edits  
- `BLESSBOARD_TENANT_ROUTING_MODE` flips  
- Authoritative routing enable  
- Payment/checkout enablement  
- Inventing API/webhook/mailbox/GUI for blocked batches  
- Git commit / push (unless separately requested)

---

## 17. Git status

**Branch:** `V5`…`origin/V5`  
**HEAD:** `fa36fea`  
**Dirty:** **~69** paths (38 modified · 31 untracked at handover capture; plus this file when written)

### Modified (representative Network + shared)

- `db/seeds/003_blessboard_plans.sql`
- `src/platform/services/entitlementService.js`, `platformAdminDomains.js`, `platformAdminEntitlements.js`, `auditEventService.js`, `auditEventRepository.js`
- `src/platform/http/platformAdminRoutes.js`
- `src/blessboard/http/hqReportsRoutes.js`, `hqAdminNav.js`, `hqAdminShellLocals.js`, related HQ modules
- `src/church/platformPricingContent.js`, `platformFaqContent.js`, `platformPublicSeo.js`
- `views/blessboard/v5/hq/*`, `apex/features.ejs`, PA domain/org detail
- `public/blessboard/v5/hq-admin.css`
- Commercial/pricing docs + tests (`platform-entitlements`, pricing, FAQ, apex marketing, reports-audit, a11y)

### Untracked (Network program docs + surfaces)

- `docs/product/NETWORK_*.md`, `docs/gui/BATCH_NETWORK_*.md`, `NETWORK_*_AUDIT.md`, queue/map docs  
- `docs/security/NETWORK_FEATURE_SECURITY_AUDIT.md`  
- `docs/release/THREE_PACKAGE_REGRESSION_REPORT.md`  
- `docs/handover/NETWORK_IMPLEMENTATION_HANDOVER.md` (this file)  
- `tests/blessboard-hq-executive-dashboard.test.js`, `blessboard-hq-governance-audit.test.js`  
- `views/blessboard/v5/hq/executive-dashboard.ejs`, `governance-audit.ejs`

---

## 18. Latest commits

Committed history on `V5` (Network work itself is mostly **uncommitted** atop these):

| Hash | Date | Subject |
|------|------|---------|
| `fa36fea` | 2026-07-19 16:23 +0300 | New screens implementation |
| `de660d3` | 2026-07-19 06:57 +0300 | New screens implementation |
| `e778961` | 2026-07-19 01:05 +0300 | New screens implementation |
| `a1503ab` | 2026-07-18 23:59 +0300 | New screens implementation |
| `9efb92d` | 2026-07-18 23:54 +0300 | New screens implementation |
| `7ee6e5f` | 2026-07-18 23:31 +0300 | New screens implementation |
| `083424e` | 2026-07-18 22:37 +0300 | New screens implementation |
| `8286ad1` | 2026-07-18 22:20 +0300 | New screens implementation |
| `5e6b9ff` | 2026-07-18 21:34 +0300 | New screens implementation |
| `d29d6a7` | 2026-07-18 20:50 +0300 | New screens implementation |

Suggested message when committing Network tree (from regression report):

```
docs: three-package regression — Foundation, Growth, Network ready with checks

Record local non-destructive regression (661 pass) and package readiness,
including Network entitlement honesty and remaining external-service blockers.
```

(Or split feature vs docs PRs as preferred.)

---

## Stop

Network implementation handover complete. **All Network implementation stops here.** Next work requires an explicit new prompt (commit/PR, hosted ops, or elevated external-provider programs).
