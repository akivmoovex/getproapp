# Commercial feature matrix reconciliation

**Status:** Complete  
**Date:** 2026-07-19  
**Scope:** Public marketing copy vs Foundation / Growth readiness  
**Out of scope:** Billing runtime, checkout, persisted `plan_key` values, entitlement catalogue flag flips for deferred modules

## 1. Sources consulted

| Source | Role |
|--------|------|
| [`docs/release/FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md) | Foundation implemented capacity and soft gaps |
| [`docs/release/GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md) | Growth live differentiators vs deferred catalogue rows |
| [`docs/product/BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) | Approved prices and active-branch billing |
| `src/church/platformPricingContent.js` | Public pricing matrix |
| `src/church/platformFaqContent.js` | Apex FAQ answers |
| `views/blessboard/v5/apex/{features,for-churches,pricing}.ejs` | Apex marketing pages |
| `src/church/platformPublicSeo.js` | Meta descriptions |

## 2. Pricing preserved (unchanged)

| Package | List price | Billing unit |
|---------|------------|--------------|
| Foundation | USD 0 / month | Flat |
| Growth | USD 14.99 | Per **active branch** / month |
| Network | USD 29.99 | Per **active branch** / month |

Also preserved:

- HQ is not billed as a branch
- Church members are not billed individually
- Custom organization domain, hosted mailboxes, API/webhooks — **Network-only** (assisted / by arrangement)
- Contact-led onboarding; no public checkout
- Persisted plan keys remain `free` / `growth` / `professional` (display Foundation / Growth / Network)

## 3. Implemented claims (safe to advertise)

### Foundation

- 1 HQ, maximum 1 active branch
- Up to 250 active members; up to 10 administrator accounts
- Public church website and member portal
- Basic reporting (HQ aggregates)
- Member registration review, attendance recording, content publishing, member requests (as enabled)

### Growth (beyond Foundation)

- Unlimited active branches
- Cross-branch HQ administration
- Advanced attendance and giving reports (`advanced_reports`)

### Network (beyond Growth)

- Custom organization domain (assisted onboarding — **manual DNS/TLS**, not automated)
- Executive dashboard and governance audit (**implemented** when entitled)
- Hosted mailboxes — Network-only; up to catalogue capacity **by arrangement** when an external provider is approved (not self-serve today)
- Integrations / API / webhooks **by arrangement** (not live self-serve)
- Advanced custom roles **assisted / by arrangement** (fixed HQ/branch roles live)
- File exports **by arrangement**
- Priority support and assisted onboarding (ops; **no published SLA**)

## 4. Deferred — must not be sold as available

Removed or clarified so they are **not** presented as live product:

| Claim | Disposition |
|-------|-------------|
| Advanced workflows / scheduling (Growth) | Removed from public matrix; not available |
| Scheduled message delivery / automated report email | Explicitly excluded in pricing third-party note |
| Surveys, appointments, volunteer scheduling | Explicitly excluded; not marketed as live |
| Forgot-password / reset-link flow | FAQ login-help rewritten (admin/Support path only) |
| Public contact message POST form | FAQ clarifies published contacts only; no online contact form |
| SSO | Features page: not included |
| “Advanced analytics” as a blanket Growth claim | Replaced with advanced attendance & giving reports |

**“Planned” labeling:** product policy for this pass is to **omit** deferred capabilities from available bullets rather than advertise them as planned. Network assisted/by-arrangement language is retained only where pricing decision already allows it.

## 5. Files updated

| File | Change |
|------|--------|
| `src/church/platformPricingContent.js` | Growth/Network bullets + comparison rows + honesty note |
| `src/church/platformFaqContent.js` | Branches, forms, login help, who-can-use, pricing |
| `src/church/platformPublicSeo.js` | Home / features / for-churches meta |
| `views/blessboard/v5/apex/features.ejs` | Advanced reports live; SSO not included |
| `views/blessboard/v5/apex/for-churches.ejs` | Soften “complete toolkit”; admin copy |
| `docs/product/BLESSBOARD_PRICING_DECISION.md` | §1–§2 matrix aligned to readiness |
| `tests/church-platform-pricing.test.js` | Reporting + Growth honesty assertions |
| `tests/church-platform-public-faq.test.js` | Deferred-claim guards |
| `tests/blessboard-apex-marketing.test.js` | Features/pricing honesty assertions |

## 6. Intentionally not changed

- `blessBoardBillingCatalogue` cents and billing calc
- Persisted / seed `plan_key` values
- Package entitlement flags inside `blessBoardPackageCatalogue` (internal gate matrix; catalogue aspirational flags remain documented as deferred for product elevation — public marketing no longer sells them)
- Auth, routes, or checkout behavior

## 7. Verification

Run:

```bash
npm run test:blessboard:catalogue
npm run test:blessboard:apex-marketing
node --test tests/church-platform-pricing.test.js tests/church-commercial-catalogue.test.js tests/church-platform-public-faq.test.js
```

Results recorded in the session that completes this reconciliation.

| Suite | Result |
|-------|--------|
| `npm run test:blessboard:catalogue` | **15 pass / 0 fail** |
| `npm run test:blessboard:apex-marketing` | **7 pass / 0 fail** |
| `tests/church-platform-pricing.test.js` + `church-commercial-catalogue.test.js` + `church-platform-public-faq.test.js` | **22 pass / 0 fail** |

## 8. Stop condition

Reconciliation complete. No further product feature work under this prompt.
