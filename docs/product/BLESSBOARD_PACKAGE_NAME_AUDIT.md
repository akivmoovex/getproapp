# BlessBoard package name audit (Foundation / Growth / Network)

**Date:** 2026-07-19  
**Status:** Complete (terminology / display only)  
**Approved commercial model:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md)  
**Out of scope:** plan-key migration (Phase B), payment collection, new product features

## Approved public packages

| Public name | List price | Persisted legacy `plan_key` (may remain) |
|-------------|------------|------------------------------------------|
| **Foundation** | USD 0 / month | `free` |
| **Growth** | USD 14.99 / active branch / month | `growth` |
| **Network** | USD 29.99 / active branch / month | `professional` (active); `partner` (inactive legacy) |

### Billing vocabulary rules

- Billing unit on Growth/Network: **active branch**
- **HQ is not billed** as a branch
- **Members are not billed** individually (capacity limits ≠ seat billing)
- Custom organization domain + hosted mailboxes: **Network only**
- Foundation: max **1** active branch, up to **250** members, up to **10** admin / leadership accounts

---

## 1. Files reviewed

### V5 views
- `views/blessboard/v5/apex/pricing.ejs`, `features.ejs`, `register-church.ejs`, `for-churches.ejs`, related apex shells
- `views/blessboard/v5/platform-admin/plans.ejs`, `subscriptions.ejs`, `organization-detail.ejs`

### Public content / SEO / FAQ
- `src/church/platformPricingContent.js`
- `src/church/blessBoardPackageCatalogue.js`, `blessBoardBillingCatalogue.js`
- `src/church/platformFaqContent.js`, `platformPublicSeo.js`
- `src/blessboard/http/apexMarketingContent.js`, `renderApexMarketing.js`

### Platform-admin display mapping
- `src/platform/services/listPlatformPlansCatalogue.js` (presents `displayName` + `planKey`)
- `db/seeds/003_blessboard_plans.sql` (display remaps; keys preserved)

### Emails / generated documents
- `src/church/notificationTemplateCatalogue.js` (Growth / Foundation wording; no Free/Professional package titles)

### Tests
- `tests/church-commercial-catalogue.test.js`
- `tests/church-platform-pricing.test.js`
- `tests/blessboard-apex-marketing.test.js`
- `tests/blessboard-platform-admin-shell.test.js` (plans + org entitlements)
- `tests/blessboard-v5-a11y-structure.test.js` (plans directory copy)

### Documentation
- `docs/product/BLESSBOARD_PRICING_DECISION.md`
- `docs/gui/BATCH_02B_APEX_MARKETING.md`, `BATCH_20A_PLATFORM_PLANS.md`, `BATCH_19E_PLATFORM_PLANS.md`
- `docs/migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`

### Explicitly not treated as V5 public SoT
- Stitch four-tier / staff-pricing frames (decorative)
- V4 `src/church/churchPlans.js` (`label: "Free"`) — church-pilot path
- Historical comment in `db/postgres/098_church_growth_billing.sql` mentioning USD 14.90 (not user-facing)

---

## 2. Inconsistencies found

| Finding | Where | Severity | Action |
|---------|-------|----------|--------|
| Org entitlements labeled **Users** / **Staff accounts** / **Branches** / **Custom email** | `organization-detail.ejs` | Medium (operator-facing) | **Corrected** → Members / Admin·leadership / Active branches / Hosted mailboxes |
| Usage strip mirrored those labels | Same | Medium | **Corrected** |
| Apex marketing / pricing / FAQ / SEO | Already Foundation·Growth·Network @ 14.99/29.99 | — | No change |
| Plans directory uses `displayName` + persisted key | `plans.ejs` | — | Aligned |
| Seed `plan_key` still `free`/`professional`/`partner` | `003_blessboard_plans.sql` | Expected | **Retain** |
| Constant name `STAFF_BILLING_NOTE` | `platformPricingContent.js` | Cosmetic (code id) | **Retain** — user-visible string already correct |
| Historical SQL comment “USD 14.90” | `db/postgres/098_…` | Non-user-facing | Documented only (no migration edit) |
| Stitch / batch docs mention Free·Professional as **Stitch** titles | GUI batch notes | Docs | **Retain** as mapping history |
| No user-facing Free/Professional/Partner on V5 apex pricing | Verified by tests | — | Guarded |

**Not found in V5 user-facing surfaces:** incorrect USD 14.90 list prices; staff-based public pricing; HQ billed as a branch; members described as billable seats; custom domain/email claimed on Foundation/Growth marketing.

---

## 3. User-facing corrections applied

1. **`views/blessboard/v5/platform-admin/organization-detail.ejs`**
   - Feature labels aligned with `plans.ejs` / pricing decision
   - Usage vs limits strip: Active branches · Admin / leadership accounts · Members · Custom organization domain · Hosted mailboxes
2. **`tests/blessboard-platform-admin-shell.test.js`** — asserts corrected usage labels; rejects “Staff accounts” / “Users ·”
3. **`tests/blessboard-apex-marketing.test.js`** — also rejects `\bFree\b` on `/pricing`

No billing runtime, seed keys, or entitlement math changed.

---

## 4. Persisted legacy references retained

| Surface | Retained |
|---------|----------|
| `platform.plans.plan_key` | `free`, `growth`, `professional`, `partner` |
| Seed display names | Foundation / Growth / Network / Partner (legacy) |
| Alias map in package catalogue | `free`→foundation, `professional`/`partner`→network |
| PA UI | Shows `displayName` prominently; shows `planKey` in `<code>` for operators |
| Provision default | Still `planKey: "free"` (Foundation display) until Phase B |
| Migration plan docs | Phase B not executed |

---

## 5. Tests and results

| Command | Result |
|---------|--------|
| `node --test tests/church-commercial-catalogue.test.js tests/church-platform-pricing.test.js` | **13 pass / 0 fail** |
| `npm run test:blessboard:apex-marketing` | **7 pass / 0 fail** |
| `npm run test:blessboard:platform-admin-shell` | **12 pass / 0 fail** |
| `git diff --check` | **clean** |

---

## 6. Suggested commit message

```
docs(product): audit Foundation/Growth/Network package naming

Align platform-admin entitlement labels with approved public packages; keep persisted plan keys unchanged.
```

---

## Follow-ups (not this pass)

- Phase B plan-key rename (`free`→`foundation`, `professional`→`network`) per migration plan  
- Optional rename of code identifier `STAFF_BILLING_NOTE` → clearer constant (non-user-facing)  
- Stitch refresh still shows four-tier staff pricing — ignore as commercial SoT
