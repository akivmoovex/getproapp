# Network — implementation queue

**Date:** 2026-07-19  
**Branch:** `V5` @ `fa36fea`  
**Companion:** [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) · [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) · [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

**Constraint:** Only batches that are **backend-ready** or a **safe vertical slice** (presentation / entitlement honesty / ops chrome). **No** schema for mailboxes/API/webhooks without approved providers. **No** DNS/SSL automation. **No** payment collection. **No** managed-service productization.

**Rule:** One feature (or two tightly related surfaces) per batch.

**Excluded from this queue:** All rows in [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) marked REQUIRES_EXTERNAL_SERVICE / NOT_SOFTWARE_FEATURE / unsigned advanced programs.

---

## Queue order (fixed)

1. Network commercial honesty (PA + apex residual)
2. Assisted custom-domain ops chrome
3. Network entitlement isolation / downgrade honesty
4. Final Network parity docs

---

## Executable batches

| Order | Feature | Stitch IDs | Route | Backend | Entitlement | External dependency | Status | Blocker |
|------:|---------|------------|-------|---------|-------------|----------------------|--------|---------|
| **NW-Q01** | PA Network plan + entitlement honesty | Plans D `4d0f59ac6acf4fcc9e1e0ed746abb5fd` · M `b5953809962f4e0a8eae4ea96aa4575a` | `/admin/organizations/:key` (plan + entitlements), `/admin/plans` | Ready — `listActivePlans` includes `professional`; FEATURE_KEYS display | `custom_domain` / `custom_email` flags | None | PARTIAL | Copy must keep “assisted / by arrangement”; no checkout |
| **NW-Q02** | Assisted custom-domain ops chrome | Settings-adapted D `30e3856782bd41b6bf14402e1e535cbd` · M `efb0fd24f1184968be79083974dcd092` | `/admin/domains`, `/admin/domains/:hostname` | Ready — `platform.domains` + list/detail | Surface org `custom_domain` entitlement state; no invent verify jobs | Manual DNS (documented only) | PARTIAL | Do **not** add DNS/SSL automation or purchase UI |
| **NW-Q03** | Network entitlement isolation (Growth deny) | — (tests + denial copy if any surface appears) | Direct provision/assert paths; PA overrides | Ready — `assertFeature(custom_domain)` | Foundation/Growth `custom_domain`/`custom_email` false | None | PARTIAL | Expand focused tests if gaps; no second entitlement system |
| **NW-Q04** | Apex Network marketing residual | Pricing D `1c50e898…` · M `181ec1f8…`; FAQ pair | `/pricing` (+ `#faq`), `/features` | Ready — content modules | Pricing SoT | None | COMPLETE-ish | Tiny honesty polish only; no new Network claims |
| **NW-Q05** | Network coverage / map hygiene (docs) | Enumerate Network rows | docs only | N/A | N/A | None | audit | Update map notes for Network PARTIAL domain ops |

---

## Batch detail

### NW-Q01 — PA Network plan + entitlement honesty

| Field | Value |
|-------|--------|
| Package | Network / Platform ops |
| Backend ready | Yes |
| Likely files | `organization-detail.ejs`, `plans.ejs`, `platformAdminEntitlements.js` (locals/copy only), PA CSS, PA shell tests |
| Requirements | Remap `professional` → Network in user-facing chrome where still raw; assisted-onboarding hint; show custom domain/email capability states without inventing mailbox provision UI |
| Tests | `blessboard-platform-admin-shell`, `platform-entitlements`, `git diff --check` |
| Stop | No self-serve Network checkout; no mailbox CRUD |

### NW-Q02 — Assisted custom-domain ops chrome

| Field | Value |
|-------|--------|
| Package | Network |
| Backend ready | Yes (registry) |
| Likely files | `domains.ejs`, `domain-detail.ejs`, `listPlatformDomains.js` / detail locals, `platform-admin.css`, PA shell tests |
| Requirements | Show hostname type/status/verified from DB; link org; when org lacks `custom_domain`, honest unavailable for custom-type ops; preserve CSRF on existing mutations only |
| Tests | `blessboard-platform-admin-shell`, a11y structure, stylelint CSS, `git diff --check` |
| Stop | No Force Verify / Buy Domain / cert issuance / ACME |

### NW-Q03 — Entitlement isolation

| Field | Value |
|-------|--------|
| Package | Network vs Growth/Foundation |
| Backend ready | Yes |
| Likely files | Focused tests; provision path only if assert gap found (prefer tests-first) |
| Requirements | Prove Foundation/Growth cannot insert BlessBoard `domain_type=custom`; Network/`professional` can when entitled; overrides still allowlisted |
| Tests | `platform-entitlements`, provisioning-related if present |
| Stop | No new FEATURE_KEYS; no mailbox assertions pretending provider exists |

### NW-Q04 — Apex Network residual

| Field | Value |
|-------|--------|
| Package | Platform marketing |
| Backend ready | Yes |
| Likely files | `platformPricingContent.js`, FAQ, apex pricing/features EJS only if honesty gap |
| Requirements | Network bullets remain assisted/by-arrangement; no API/mailbox sold as self-serve live |
| Tests | `apex-marketing`, `church-platform-pricing`, public FAQ |
| Stop | Commercial reconciliation already scrubbed — skip if no gap |

### NW-Q05 — Docs hygiene

| Field | Value |
|-------|--------|
| Package | Both |
| Likely files | `STITCH_SCREEN_MAP.md` Network notes, this queue, coverage |
| Stop | Docs only; MATCHED not claimed without browser↔Stitch evidence |

---

## Explicitly not queued

| Feature | Why |
|---------|-----|
| Hosted mailbox provision UI | REQUIRES_EXTERNAL_SERVICE — no provider |
| Public API / webhook admin | REQUIRES_EXTERNAL_SERVICE — no protocol |
| External integration marketplace | REQUIRES_EXTERNAL_SERVICE |
| Custom role matrix / leader roles | PRODUCT_DECISION_REQUIRED + schema |
| Executive export builder / custom report templates | MISSING_BACKEND + by arrangement |
| DNS / SSL automation | Excluded by audit rules |
| Managed services portal | NOT_SOFTWARE_FEATURE |
| Payment collection | Out of scope |
| Growth deferred catalogue (surveys, schedules, …) | Remain DEFERRED — not Network unlocks |

---

## Recommended Agent-window schedule

| Window | Batches | Focus | Est. |
|--------|---------|-------|------|
| **NW-W1** | NW-Q01 | PA Network plan / entitlement honesty | 1 |
| **NW-W2** | NW-Q02 | Domains directory + detail entitlement chrome | 1–2 |
| **NW-W3** | NW-Q03 | Isolation tests / assert gaps | 1 |
| **NW-W4** | NW-Q04 → NW-Q05 | Apex residual (if needed) + docs | 1 |

**Parallelism:** NW-W1 and NW-W3 may run in parallel. NW-W2 after or with W1 (shared PA shell). NW-W4 last.

**Do not** open mailbox/API/webhook windows until product + provider decisions land and [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) is updated.

---

## Totals

| Metric | Count |
|--------|------:|
| Executable batches | **5** (NW-Q01–Q05) |
| Agent windows | **4** |
| Blocked / excluded features | See blocked doc |

---

## Stop

Queue documentation only. No application implementation in this audit prompt.
