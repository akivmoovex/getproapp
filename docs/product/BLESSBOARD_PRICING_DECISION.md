# BlessBoard pricing decision

**Status:** Approved  
**Date:** 2026-07-18  
**Scope:** Public commercial model and catalogue alignment for BlessBoard V5  
**Out of scope:** Payment collection, checkout, subscription billing runtime, database schema changes

## 1. Approved package table

| Package | Price | HQ | Active branches | Members | Admin / leadership | Notes |
|---------|-------|----|-----------------|---------|--------------------|-------|
| **Foundation** | USD 0 / month | 1 | Maximum **1** | Up to **250** active | Up to **10** | Entry package |
| **Growth** | **USD 14.99** per active branch / month | 1 | **Unlimited** | Unlimited (fair use) | Fair use | Advanced attendance & giving reports, cross-branch HQ administration |
| **Network** | **USD 29.99** per active branch / month | 1 | **Unlimited** | Unlimited (fair use) | Fair use + advanced roles (assisted / by arrangement) | Custom domain, hosted mailboxes, integrations, executive exports (by arrangement), priority support, assisted onboarding |

### Terminology

- **Active branch** is the billing unit on Growth and Network.
- **HQ is not billed** as a branch.
- **Church members are not billed** individually.
- Foundation may have only one active branch.
- Growth and Network have no maximum branch count.
- Custom domains and hosted email are **Network-only**.

## 2. Feature comparison (public)

| Capability | Foundation | Growth | Network |
|------------|------------|--------|---------|
| Public church website & member portal | Yes | Yes | Yes |
| Active branches | Max 1 | Unlimited | Unlimited |
| Active members | Up to 250 | Fair use | Fair use |
| Admin / leadership accounts | Up to 10 | Fair use | Fair use + advanced roles |
| Reporting | Basic HQ aggregates | Advanced attendance & giving + cross-branch | Growth reporting + executive exports (by arrangement) |
| Cross-branch HQ administration | — | Yes | Yes |
| Scheduled broadcasts / report email / surveys / appointments / volunteer scheduling | — | — (not in current product) | — (not in current product) |
| Custom organization domain | — | — | Yes (assisted onboarding; **not** self-service DNS today) |
| Hosted mailboxes per active branch | None | None | Up to **5** |
| API / webhooks / integrations | — | — | By arrangement |
| Priority support & assisted onboarding | — | — | Yes |

Capabilities labeled “by arrangement” or “assisted onboarding” must not be presented as self-serve product features until implemented.

## 3. Active-branch definition

An **active branch** is a church branch whose operational status is active (eligible for public site / member / admin use under product rules).

- Billable on Growth and Network: **every** active branch, including the first.
- Not billable: HQ itself (no separate HQ line item).
- Not billable: inactive / suspended / archived branches (when product marks them non-active).
- Member seat counts are **capacity limits**, not a billing meter.

## 4. Billing examples (list price, monthly)

| Scenario | Package | Active branches | Monthly list |
|----------|---------|-----------------|--------------|
| Single-branch plant | Foundation | 1 | **USD 0** |
| Two-branch Growth church | Growth | 2 | 2 × 14.99 = **USD 29.98** |
| Five-branch Growth church | Growth | 5 | 5 × 14.99 = **USD 74.95** |
| Three-branch Network church | Network | 3 | 3 × 29.99 = **USD 89.97** |

Annual prepay (when billing runtime is enabled later): **15%** discount on the annual list (12 × monthly), as already modeled in `blessBoardBillingCatalogue` / draft invoice calc. **No payment provider is live.**

## 5. Downgrade rules

### Growth → Foundation (existing platform-admin path)

Before assignment, eligibility checks must pass (existing `evaluateFoundationDowngradeEligibility`):

- Active branches ≤ 1  
- Active members ≤ 250  
- Privileged admin/leadership accounts ≤ 10  
- No blocking Growth-only scheduled jobs / features

Operators must resolve blockers before downgrade; the product does **not** auto-deactivate branches or members.

### Network → Growth / Foundation

- **Not** available via current self-serve or platform-admin assignable codes.
- Platform-admin assignment remains **Foundation** and **Growth** only (`ASSIGNABLE_PACKAGE_CODES`).
- Network activation remains **ops / assisted onboarding** until a later assignment workflow is approved.
- Downgrade from Network must also revoke Network-only infrastructure (custom domain, hosted mailboxes) before or as part of the change — **manual process today**.

## 6. Domain and email rules

| Item | Rule |
|------|------|
| Default hostname | BlessBoard subdomain (e.g. `yourchurch.blessboard.com`) on all packages |
| Custom organization domain | **Network only**; assisted onboarding; not self-service DNS |
| Hosted mailboxes | **Network only**; up to **5** per active branch |
| Registrar / DNS third-party fees | Separately quoted; not included in package list price |
| Payment processing (giving) | Third-party; separately quoted when applicable |

## 7. Code conflicts (compatibility impact)

### Aligned after this change

| Layer | Codes / labels | Prices |
|-------|----------------|--------|
| `blessBoardPackageCatalogue` | `foundation`, `growth`, `network` | Capacity SoT |
| `blessBoardBillingCatalogue` | Growth **1499¢**, Network **2999¢** | Active-branch price book |
| `platformPricingContent` + apex `/pricing` | Foundation / Growth / Network | Matches price book |
| FAQ / register-church / features copy | Three-package model | Matches |

### Still divergent (safe display remap only)

| Layer | Keys | Display | Risk |
|-------|------|---------|------|
| `db/seeds/003_blessboard_plans.sql` | `free`, `growth`, `professional`, `partner` | Foundation / Growth / Network / Partner (legacy inactive) | Runtime still resolves **plan_key** strings `free` / `professional` / `partner` |
| `platform.plans` subscriptions | Existing rows may still reference old keys | Labels updated on re-seed | Entitlement service continues to key off `plan_key` |
| Church `plan_code` | May be `foundation`/`growth` or legacy aliases | Alias map in package catalogue | Network church codes may exist via alias (`professional`/`partner` → network) without platform-admin assign UI |
| Stitch Pricing frames | Still show four-tier / staff pricing visually | Decorative only | Do **not** treat Stitch as commercial SoT |

### Explicit non-goals of this pass

- No rename of `platform.plans.plan_key` values  
- No destructive delete of `partner` / `professional` rows  
- No checkout / Stripe / subscription collection  
- No schema migration

## 8. Migration plan (later runtime reconciliation)

**Goal:** One commercial vocabulary end-to-end: `foundation` / `growth` / `network`.

### Phase A — already done (this change)

1. Public marketing and church package/billing catalogues use Foundation / Growth / Network.  
2. Seed **display_name** / descriptions remapped; `partner` marked **inactive**.  
3. Legacy aliases: `free`→foundation, `professional`/`partner`→network.  
4. Document conflicts and risks.

### Phase B — data migration (requires approved migration + downtime window)

1. Add migration to:
   - Insert or rename plan rows so `plan_key` becomes `foundation`, `growth`, `network`.
   - Remap `platform` subscription / org plan foreign keys from `free`→`foundation`, `professional`→`network`, `partner`→`network` (or retire partner after remap).
2. Update `entitlementService` and any SQL that hardcodes `free` / `professional` / `partner`.
3. Backfill church `plan_code` where still on legacy aliases (optional if alias map remains).
4. Expand or keep Network assignment as assisted-only until product enables admin assignment.
5. Re-seed / fixture updates; expand tests (`platform-entitlements`, provisioning).

### Phase C — billing runtime (separate product)

1. Wire payment provider.  
2. Activate Growth/Network invoices from price book.  
3. Enforce Network domain/mailbox provisioning gates.

**Do not run Phase B without a written rollback script and staging rehearsal.**

## 9. Compatibility and rollback risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Seed `plan_key` still `free`/`professional` | Platform-admin UI may show old keys unless it uses `display_name` | Prefer display_name in UI; migrate keys later |
| Existing subscriptions on `partner` | Inactive catalogue row; features retained | Keep row until remap; do not delete |
| Platform tests assuming Free max_branches=2 | May fail after seed limit → 1 | Update tests with Phase B or adjust fixtures |
| Assignable packages exclude Network | Correct: Network is assisted | Document; do not assign via Growth UI |
| Stitch still four-tier | Visual drift vs site | Accept until Stitch refresh; marketing code is SoT for commerce |
| Rollback of marketing only | Restore previous `platformPricingContent` | Price book cents stay at 14.99/29.99 unless also reverted |

**Rollback of this commercial content change:** revert catalogue + marketing + seed display SQL + tests. Do **not** partially roll back price book while leaving marketing on 14.99/29.99.

## 10. Source-of-truth ownership (going forward)

| Concern | Owner module |
|---------|----------------|
| Capacity / entitlements (church ops) | `src/church/blessBoardPackageCatalogue.js` |
| USD active-branch amounts | `src/church/blessBoardBillingCatalogue.js` |
| Public pricing presentation | `src/church/platformPricingContent.js` |
| Platform subscription catalogue keys | `platform.plans` (migration pending) |

---

See also: [`docs/gui/BATCH_02B_APEX_MARKETING.md`](../gui/BATCH_02B_APEX_MARKETING.md) §9.
Public marketing honesty pass after Foundation/Growth readiness: [`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](./COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md).
