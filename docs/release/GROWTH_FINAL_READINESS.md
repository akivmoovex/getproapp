# Growth final product readiness

**Date:** 2026-07-19  
**Branch:** `V5` @ `de660d3` (+ working-tree retained Growth hardening)  
**Mode:** Audit only — **no features added**  
**Commercial SoT:** [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) · `db/seeds/003_blessboard_plans.sql` · `blessBoardPackageCatalogue.js` · [`FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md`](../product/FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md) · [`GROWTH_PLAN_PARITY_AUDIT.md`](../gui/GROWTH_PLAN_PARITY_AUDIT.md) · [`FOUNDATION_FINAL_READINESS.md`](./FOUNDATION_FINAL_READINESS.md)

---

## Executive verdict

| Verdict | Detail |
|---------|--------|
| **Overall** | **READY WITH MANUAL CHECK** |
| Local automated Growth product (implemented scope) | **READY** — entitlement, multi-branch, authz, reports, HQ/BA GUI suites pass |
| Catalogue / pricing “scheduling & advanced workflows” claims | **DEFERRED** as live V5 product — do **not** demo scheduled broadcasts/reports, surveys, appointments, volunteers, offline attendance |
| Network-only (domain, mailboxes, API, webhooks, managed services) | **NOT_IN_SCOPE** — Growth plan features `custom_domain` / `custom_email` = **false** |
| Hosted public demo | **READY WITH MANUAL CHECK** — personas + CMS ([`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) B02–B04) |
| Authoritative routing / production cutover | **BLOCKED** (ops/migration — not Growth GUI) |

Growth is **demo-ready** for: Foundation-retained surfaces + **unlimited branches** + **cross-branch HQ oversight** + **`advanced_reports`** (attendance & giving detail). It is **not** ready to sell catalogue-aspirational scheduling as live software.

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **READY** | Approved Growth capability works; automated evidence; Foundation denied where required |
| **READY WITH MANUAL CHECK** | Code/tests OK; demo needs content, personas, ops branch-create, or browser |
| **BLOCKED** | External dependency (ops, hosted evidence, product unlock) |
| **DEFERRED** | Catalogue/marketing aspiration or gate-stop — not live V5 Growth GUI |
| **NOT_IN_SCOPE** | Network-only |

---

## Approved Growth package (SoT)

| Item | Approved | Runtime (`plan_key = growth`) |
|------|----------|-------------------------------|
| Price | **USD 14.99** per **active billable branch** / month | Display “Growth”; billing catalogue cents; **no checkout live** |
| HQ | 1 | Not a separate invoice line (“HQ is not billed”) |
| Active branches | **Unlimited** | `max_branches` **NULL** |
| Members / staff | Fair use (unlimited soft) | `max_users` / `max_staff_accounts` **NULL** |
| Foundation features | All retained | Same CMS, member, BA, basic hub |
| Advanced reporting | Yes | `advanced_reports` = **true** |
| Cross-branch HQ admin | Yes | HQ mounts + `/b/:branchKey` + church-scoped lists |
| Custom domain / hosted email / API / webhooks | **No** (Network) | `custom_domain` / `custom_email` = **false** |
| Scheduled broadcasts / report jobs | Marketing “Yes” in comparison table | **No V5 scheduler** → treat as **DEFERRED** for demo honesty |

### Billing vs capacity

| Concept | Growth behavior |
|---------|-----------------|
| Capacity | Unlimited active `blessboard.branches` rows |
| List price | USD 14.99 per active **billable** branch; HQ not billed as its own line (SoT §1–§3) |
| Runtime billing collection | **Not live** — operators assign plan; no Stripe |

---

## Area classifications

| Area | Class | Evidence / note |
|------|-------|-----------------|
| Inherits all Foundation READY surfaces | **READY** | See Foundation readiness |
| Multi-branch create / activate under Growth | **READY** | Entitlements: Growth allows additional campuses; Foundation blocked |
| Branch-limit on Foundation (contrast) | **READY** | Same suite — Foundation `max_branches` deny |
| HQ branch registry / selector (church scope) | **READY** | branch-list + hq-shell; foreign branch → 404 |
| HQ cross-branch members / registrations / content / forms / requests / announcements | **READY** | Authz + content-admin + module suites |
| HQ attendance / giving **manage** aggregates | **READY** | BA/HQ attendance & giving suites |
| HQ reports hub | **READY** | Live snapshot; unavailable generators honest |
| HQ advanced attendance detail | **READY** | `advanced_reports`; Growth live data; Foundation deny |
| HQ advanced giving detail | **READY** | Same gate (FG-Q12) |
| HQ audit trail | **READY** | reports-audit |
| HQ `/hq/roles` (fixed roles) | **READY** | Soft seats unlimited on Growth; fixed three roles only |
| Navigation (Growth entitled links) | **READY** | Hub links attendance/giving when advanced; Foundation non-link cards |
| Direct-route Foundation denial | **READY** | reports-audit Foundation deny HTML, no aggregate leak |
| No fabricated analytics | **READY** | Tests forbid chart.js / canvas / projectedGrowth / YoY |
| No unsupported scheduling UI claims | **READY** (product UI) | Reports unavailable “scheduled builders”; announcements publish-now only; **no** schedule nav |
| Catalogue scheduled broadcasts/reports / surveys / appointments / volunteers / offline | **DEFERRED** | No V5 jobs/schema — do not sell as live |
| Network domain / email / API / webhooks | **NOT_IN_SCOPE** | Fail-closed `assertFeature` on domain provision |
| HQ branch **create UI** | **READY WITH MANUAL CHECK** | Create service exists; HQ UI intentionally unavailable — use CLI/`createBlessBoardBranch` |
| Checkout / subscription collection | **DEFERRED** / **NOT live** | Pricing display only |
| Hosted demo personas + CMS | **READY WITH MANUAL CHECK** | Release blockers B02–B04 |
| Shadow / authoritative / production cutover | **BLOCKED** | Release blockers B01, B05–B10 |

---

## Verification checklist (prompt requirements)

| Check | Result |
|-------|--------|
| Multi-branch provisioning | **Pass** (service/entitlement); UI create absent by design |
| Branch-limit behavior | **Pass** — Growth unlimited; Foundation blocked |
| HQ oversight | **Pass** — church-scoped multi-branch mounts |
| Advanced attendance / giving | **Pass** — entitled Growth; denied Foundation |
| Reports | **Pass** — hub + detail + audit; real aggregates only |
| Retained Growth workflows | **Pass** for implemented set; catalogue scheduling **DEFERRED** |
| Entitlement enforcement | **Pass** — `advanced_reports`, unlimited caps, Network flags false |
| Navigation | **Pass** — entitled Growth links; no Broadcasts/templates pretend |
| Direct-route denial for Foundation | **Pass** |
| No fabricated analytics | **Pass** |
| No unsupported scheduling claims (in product UI) | **Pass**; marketing comparison table still says “scheduling” — **demo caveat** |

---

## Blockers and demo caveats

### Product blockers for “full Growth brochure”

| ID | Item | Class | Action |
|----|------|-------|--------|
| G1 | Scheduled communications / reports | **DEFERRED** | Do not demo; keep unavailable copy |
| G2 | Surveys, appointments, volunteers, offline attendance | **DEFERRED** | Catalogue only |
| G3 | Self-serve checkout at USD 14.99 | **NOT live** | Operator plan assign only |
| G4 | HQ create-branch GUI | **READY WITH MANUAL CHECK** | Use approved create service / CLI |

### Not Growth blockers

| Item | Note |
|------|------|
| Network features absent | Correct |
| Foundation cannot open advanced detail | Correct |
| Stitch MATCHED not claimed | Visual polish residual |

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:platform:entitlements` | **13/13** (incl. Growth extra campuses + Foundation limit) |
| `npm run test:blessboard:authorization` | **22/22** |
| `npm run test:blessboard:reports-audit` | **7/7** |
| `npm run test:blessboard:branch-list` | **2/2** |
| `npm run test:blessboard:hq-shell` | **9/9** |
| `node --test tests/blessboard-hq-roles.test.js` | **10/10** |
| `npm run test:blessboard:attendance` | **8/8** |
| `npm run test:blessboard:giving` | **8/8** |
| `npm run test:blessboard:content-admin` | **14/14** |
| `npm run test:blessboard:route-link-audit` | **9/9** |

**Total focused:** **102** pass / **0** fail.

---

## Demo readiness statement

| Demo type | Ready? |
|-----------|--------|
| Growth multi-branch HQ + advanced attendance/giving (local, seeded) | **Yes** — **READY WITH MANUAL CHECK** for content |
| Sell Growth as unlimited branches + advanced reports + Foundation retained | **Yes** |
| Sell Growth as live scheduled workflows / surveys / offline / volunteers | **No** — **DEFERRED** |
| Sell Network domain/email/API as Growth | **No** — **NOT_IN_SCOPE** |
| Claim Foundation can use advanced detail reports | **No** — correctly denied |

---

## Stop

Growth final product audit complete. **No features added.** Network final audit is a separate prompt if required.
