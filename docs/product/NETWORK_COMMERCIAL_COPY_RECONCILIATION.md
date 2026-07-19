# Network commercial copy reconciliation

**Date:** 2026-07-19  
**Branch:** `V5`  
**Prompt:** 59. NETWORK COMMERCIAL COPY RECONCILIATION  
**Mode:** Marketing honesty only — no entitlement activation, no new product surfaces  

**Sources:** [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · Network batch docs (`docs/gui/BATCH_NETWORK_*`) · [`NETWORK_FEATURE_SECURITY_AUDIT.md`](../security/NETWORK_FEATURE_SECURITY_AUDIT.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · public pricing / FAQ / features content

---

## Status taxonomy (public language)

| Class | Meaning | Network examples |
|-------|---------|------------------|
| **Implemented now** | Live for entitled Network orgs | Executive dashboard; governance audit; custom-domain **registry** + entitlement gate; fixed HQ/branch roles; Growth inheritance |
| **Manual assisted workflow** | Sold with human ops; not automated | Custom domain DNS/TLS (assisted; no ACME automation) |
| **External provider required** | Cannot claim in-product provisioning | Hosted mailboxes; API / webhooks / integrations until designed + enabled |
| **Planned / deferred / ops-only** | Do not sell as self-serve software | Advanced custom role matrix; report templates; priority-support **SLA**; mailbox request GUI (gate-stopped) |

---

## Claims reconciled

| Claim | Before | After |
|-------|--------|-------|
| USD **29.99** / active branch / month | Preserved | **Preserved** |
| Custom domain Network-only | Assisted, not self-service DNS | Assisted **manual DNS/TLS**; explicitly **not automated** |
| Hosted mailboxes “included” | Implied live capacity | Network-only **by arrangement** when external provider approved; not self-serve |
| API / webhooks / integrations | “By arrangement” | **Not live self-serve**; by arrangement until implemented and enabled |
| Executive reporting | “Exports by arrangement” only | **Executive dashboard live**; file exports still by arrangement |
| Governance | Absent from marketing | Implied via Network ops tooling (features page) |
| Priority support | Implied product | Ops arrangement; **no published SLA** |
| Foundation / Growth copy | Unchanged intent | **Preserved** (no Network claims added) |

---

## Files updated

| File | Change |
|------|--------|
| `src/church/platformPricingContent.js` | Network description/bullets, comparison rows, third-party honesty note |
| `src/church/platformFaqContent.js` | Custom-domain + pricing answers |
| `src/church/platformPublicSeo.js` | Pricing meta honesty |
| `views/blessboard/v5/apex/features.ejs` | Custom domain, executive/governance, mailbox/API honesty |
| `docs/product/BLESSBOARD_PRICING_DECISION.md` | §1–§2 / §6 aligned |
| `docs/product/COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md` | Network beyond Growth |
| `tests/church-platform-pricing.test.js` | Network honesty assertions |
| `tests/church-platform-public-faq.test.js` | Domain/pricing honesty |
| `tests/blessboard-apex-marketing.test.js` | Features honesty |

Commercial **catalogue** aspirational flags (`email.mailboxes_per_branch=5`, nested `integrations.*`) remain data SoT for package capacity positioning — public copy no longer treats them as live self-serve product.

---

## Rules check

| Rule | Result |
|------|--------|
| Do not claim automated DNS if manual | **Pass** |
| Do not claim mailbox provisioning if only request tracking | **Pass** (no request GUI; by arrangement / provider) |
| Do not claim API/webhooks unless implemented and enabled | **Pass** |
| Do not claim integrations connected when only registry | **Pass** (no registry shipped) |
| Do not promise SLAs without contract data | **Pass** |
| Preserve USD 29.99 | **Pass** |
| Preserve custom-domain & mailbox Network-only positioning | **Pass** |
| Preserve Foundation and Growth copy | **Pass** |

---

## Verification

| Suite | Result |
|-------|--------|
| `tests/church-platform-pricing.test.js` | **Pass** |
| `tests/church-commercial-catalogue.test.js` | **Pass** |
| `tests/church-platform-public-faq.test.js` | **Pass** |
| `tests/blessboard-apex-marketing.test.js` | **Pass** |
| `git diff --check` | **Pass** |

---

## Stop

Copy reconciliation complete. No further Network implementation in this prompt.
