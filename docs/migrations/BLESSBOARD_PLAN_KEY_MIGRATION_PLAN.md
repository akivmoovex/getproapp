# BlessBoard plan_key migration plan (Phase B)

**Status:** Analysis only — **not approved for execution**  
**Date:** 2026-07-18  
**Authority:** [`docs/product/BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) §7–§8  
**Constraint:** This document does **not** implement schema, seed, or runtime changes. No destructive migration SQL is shipped here while product ambiguities remain.

---

## 0. Goal

Reconcile persisted `platform.plans.plan_key` values with the approved public package vocabulary:

| Approved public package | Intended persisted key |
|-------------------------|------------------------|
| Foundation | `foundation` |
| Growth | `growth` |
| Network | `network` |

Today, platform subscriptions and seeds still use legacy keys (`free`, `professional`, `partner`) while church package/billing catalogues already use `foundation` / `growth` / `network` (with a legacy alias map).

---

## 1. Current persisted keys

Source: `db/seeds/003_blessboard_plans.sql` + `platform.plans` / `platform.plan_features` / `platform.organization_subscriptions`.

| `plan_key` | `display_name` (seed) | `status` | Role today |
|------------|----------------------|----------|------------|
| `free` | Foundation | `active` | Default on `provisionPlatformTenant` (`planKey: "free"`) |
| `growth` | Growth | `active` | Same key as approved package; no rename needed |
| `professional` | Network | `active` | Commercial Network; still assignable by key in platform-admin |
| `partner` | Partner (legacy) | `inactive` | Retained for existing subscriptions; not offered as new catalogue default |

**Hard constraint:** `platform.plans.plan_key` is **immutable after insert** (`platform.prevent_plan_key_change` trigger in `013_create_plans_subscriptions_entitlements.sql`). In-place `UPDATE … SET plan_key = …` **will fail**. Any rename must insert new rows and repoint FKs (or temporarily disable the trigger under a controlled migration window — prefer insert/repoint).

---

## 2. Approved public packages

| Package | Billing (price book) | Capacity (package catalogue) |
|---------|----------------------|------------------------------|
| **Foundation** | USD 0 / month | Max 1 active branch; 250 members; 10 admin accounts |
| **Growth** | USD 14.99 / active branch / month | Unlimited branches; fair-use members/admins |
| **Network** | USD 29.99 / active branch / month | Unlimited branches; custom domain + hosted mailboxes (assisted) |

Sources:

- `src/church/blessBoardPackageCatalogue.js` — `PACKAGE_CODES`, `BLESSBOARD_PACKAGES`, `LEGACY_PLAN_TO_PACKAGE`
- `src/church/blessBoardBillingCatalogue.js` — `FOUNDATION` / `GROWTH` / `NETWORK` cents; **no** `free` / `professional` / `partner` price rows

Church alias map already in catalogue:

```text
free         → foundation
standard/pro → growth
professional → network
partner      → network
foundation/growth/network → identity
```

---

## 3. Proposed key mapping

### Recommended mapping (commercial SoT)

| Current `plan_key` | Target `plan_key` | Notes |
|--------------------|-------------------|-------|
| `free` | `foundation` | Display already Foundation; default provision key today |
| `growth` | `growth` | **No change** — identity |
| `professional` | `network` | Display already Network; features match Network seed |
| `partner` | **Decision required** — see §14 | Features identical to `professional` in seed; status inactive |

### Recommended physical approach (because keys are immutable)

1. **Insert** new active rows (if missing): `foundation`, `network` (and ensure `growth` exists).  
2. **Copy** `plan_features` from `free`→`foundation`, `professional`→`network` (verify row-by-row).  
3. **Repoint** `organization_subscriptions.plan_id` from old plan UUIDs to new plan UUIDs.  
4. Mark legacy rows `free` / `professional` (and optionally `partner`) as `inactive` or `retired` — **do not delete** until alias period ends.  
5. Update seeds, provision default (`free`→`foundation`), V4→V5 `mapPlanKey`, tests, and any hardcoded plan keys.

**Do not** invent a one-shot `UPDATE plan_key` script — it conflicts with the immutability trigger.

---

## 4. Existing subscription impact

| Area | Impact |
|------|--------|
| `platform.organization_subscriptions.plan_id` | Must repoint to new plan UUIDs; subscription `status` / `starts_at` / `ends_at` / `notes` unchanged |
| Unique index `organization_subscriptions_org_product_current_uidx` | Remains one current row per org+product; remapping plan_id does not create duplicates if done in place |
| Historical / non-current rows (`canceled`, `expired`, …) | Same remapping rule for consistency of reporting |
| Platform-admin UI | Already shows `display_name`; after migration keys show as `foundation` / `network` |
| Provisioning | Today assigns `planKey: "free"` — must switch to `foundation` in the same release as data remap |

**Inventory queries (pre-flight):** count subscriptions by `plan_key` and status before any write (§9).

---

## 5. Entitlement impact

### Platform resolver (`src/platform/services/entitlementService.js`)

- Resolves by **plan UUID / plan_key lookup**, not by church package codes.  
- Feature set is data-driven from `platform.plan_features` (`max_branches`, `max_users`, `max_staff_accounts`, booleans for reports/domain/email).  
- After remapping `plan_id`, effective entitlements stay the same **if** feature rows were copied identically.  
- Organization overrides (`platform.organization_entitlements`) key by `feature_key`, not `plan_key` — **no remap required** for override rows.

### Church package catalogue (`blessBoardPackageCatalogue.js`)

- Separate commercial capacity model (storage, fair-use, mailboxes, etc.).  
- Already understands `foundation` / `growth` / `network` + aliases.  
- **Not** auto-synced with `platform.plan_features`. Migration of platform keys does **not** by itself expand platform features to the full church entitlement tree.

### Risk

If `foundation` / `network` feature rows are inserted incorrectly (e.g. wrong `max_branches`), enforcement (`assertCanCreateBranch`, staff/user limits) changes. Verification must diff features before/after (§9).

---

## 6. Billing impact

| Layer | Today | After Phase B |
|-------|-------|---------------|
| `blessBoardBillingCatalogue` | Uses `foundation` / `growth` / `network` only | Unchanged (already aligned) |
| Payment provider / invoices | **Not live** | Still out of scope (Phase C) |
| Draft invoice calc | Package codes from church plan_code | Prefer remapped/aliased package codes; no new price invention |
| Platform `plan_key` | Not stored in price book | Remap is **vocabulary** alignment, not a price change |

**Billing risk is low for money movement** (no provider). Residual risk: any code that joins platform `plan_key` to price book without the alias map could miss Network/Foundation after rename if still looking for `professional`/`free`.

---

## 7. Legacy alias period

Recommend a **minimum one release** alias window after data remap:

| Legacy key | Alias target | Where |
|------------|--------------|--------|
| `free` | `foundation` | Keep inactive/retired plan row **or** catalogue alias only |
| `professional` | `network` | Same |
| `partner` | `network` (if remapped) or retain inactive | Same |
| Church `plan_code` values `free` / `professional` / `partner` / `standard` / `pro` | Existing `LEGACY_PLAN_TO_PACKAGE` | Keep until church backfill completes |

During the alias period:

- Reads accept legacy keys (findPlanByKey / resolvePackageFromPlanCode).  
- Writes / new provision use only `foundation` / `growth` / `network`.  
- Platform-admin assignable plans: product already treats Network as assisted — do not silently expand self-serve assignability.

---

## 8. Idempotent migration approach

**Principles**

1. Detect presence of target keys before insert (`WHERE plan_key IN (...)`).  
2. Upsert features by `(plan_id, feature_key)`.  
3. Update subscriptions only where `plan_id` still points at legacy plan UUIDs.  
4. Safe to re-run: no-op when all subscriptions already on target plans.  
5. Never delete legacy plan rows in the first migration pass.

**Sketch (illustrative — not executable migration ship):**

```text
1. BEGIN
2. INSERT foundation / network IF NOT EXISTS (copy metadata from free / professional)
3. COPY plan_features free → foundation, professional → network (ON CONFLICT UPDATE)
4. UPDATE organization_subscriptions
     SET plan_id = (foundation.id)
   WHERE plan_id = (free.id)
5. UPDATE organization_subscriptions
     SET plan_id = (network.id)
   WHERE plan_id = (professional.id)
6. [OPTIONAL / GATED] partner → network subscription remaps
7. SET free/professional status = 'inactive' (or 'retired')
8. COMMIT
9. Application release: provision default foundation; mapPlanKey outputs foundation/network; tests updated
```

Trigger note: do **not** UPDATE `plan_key` columns; create new keys.

---

## 9. Verification queries

Run before and after (staging + production window):

```sql
-- Catalogue inventory
SELECT plan_key, display_name, status, sort_order
  FROM platform.plans
 WHERE product_key = 'blessboard'
 ORDER BY sort_order, plan_key;

-- Feature parity check (example: free vs foundation)
SELECT f.feature_key, f.feature_kind, f.boolean_value, f.limit_value
  FROM platform.plan_features f
  JOIN platform.plans p ON p.id = f.plan_id
 WHERE p.plan_key IN ('free', 'foundation')
 ORDER BY f.feature_key, p.plan_key;

-- Subscriptions by plan_key
SELECT p.plan_key, s.status, COUNT(*) AS n
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
 GROUP BY p.plan_key, s.status
 ORDER BY p.plan_key, s.status;

-- Orgs still on legacy keys after cutover (expect 0 for free/professional if remapped)
SELECT p.plan_key, COUNT(*) 
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
 WHERE p.plan_key IN ('free', 'professional', 'partner')
   AND s.status IN ('active', 'trialing', 'past_due')
 GROUP BY p.plan_key;

-- Church plan_code distribution (V4 / church DB — separate connection)
-- SELECT plan_code, COUNT(*) FROM public.church_organizations GROUP BY 1;
```

Application checks:

- Provision new tenant → subscription `plan_key = foundation`.  
- Resolve entitlements for remapped orgs → same limits/booleans as pre-cutover snapshot.  
- Platform-admin plan assign still CSRF + confirmation; growth assign unchanged.  
- `npm test` suites: `platform-entitlements`, platform-admin shell, commercial catalogue, growth billing.

---

## 10. Rollback strategy

| Stage | Rollback |
|-------|----------|
| Before app deploy | Revert migration transaction; subscriptions still on old `plan_id`s |
| After app deploy expecting new keys | Redeploy previous app build **and** remoint subscriptions back to legacy plan UUIDs (keep legacy rows) |
| After deleting legacy rows | **Not recoverable** without backup — deletion forbidden until alias period ends |

Rollback SQL pattern (illustrative): reverse `plan_id` updates using a saved mapping table written during migration:

```text
migration_plan_key_map(old_plan_id, new_plan_id, old_plan_key, new_plan_key)
```

Require:

- Staging rehearsal with production-like subscription counts  
- Snapshot / backup of `platform.plans`, `plan_features`, `organization_subscriptions`  
- Explicit “go / no-go” after verification queries

---

## 11. Deployment order

1. **Freeze** platform-admin plan assignment during the cutover window (ops procedure).  
2. **Backup** platform entitlement tables.  
3. **Run inventory queries**; archive results.  
4. **Apply data migration** (insert targets, copy features, remoint subscriptions) — still serve old app if it only looks up by UUID via plan_id (safe) **or** deploy app simultaneously if any code hardcodes `free`.  
5. **Deploy application** changes: provision default `foundation`; V4→V5 `mapPlanKey`; seeds; tests; admin catalogue expectations.  
6. **Verify** (§9).  
7. **Open** assignment freeze.  
8. **Alias period** (≥1 release).  
9. Later (separate change): retire/delete legacy keys only after zero current subscriptions and product sign-off.

Church `plan_code` backfill is **optional parallel** work; can stay on aliases.

---

## 12. Tests required

| Suite / area | Expectation after implementation |
|--------------|----------------------------------|
| `tests/platform-entitlements.test.js` | Expect `foundation` default; assign `network` instead of `professional` where appropriate |
| `tests/blessboard-platform-admin-shell.test.js` | `data-bb-plan-key="foundation"`; Network via `network` |
| `tests/church-commercial-catalogue.test.js` | Alias map still covers legacy during alias period |
| `tests/church-platform-pricing.test.js` / billing | Unchanged package codes |
| `tests/migration-mapping.test.js` + V4→V5 helpers | `mapPlanKey` emits approved keys |
| Provisioning tests | New orgs get `foundation` subscription |
| Idempotency test | Migration re-run leaves counts unchanged |
| Feature parity test | Diff `free` vs `foundation`, `professional` vs `network` features empty after copy |

Do **not** weaken limit-enforcement tests; keep Foundation `max_branches = 1` as seed SoT.

---

## 13. Data conflict handling

| Conflict | Handling |
|----------|----------|
| Target `foundation` / `network` already exists with different features | **Stop**; human review feature diff before remapping subscriptions |
| Subscription points at missing plan | Quarantine org; do not invent a plan |
| Both `professional` and `partner` current for same org | Impossible under unique current-sub index; if historical rows exist, remap independently |
| Church `plan_code=network` but platform sub still `free` | Out of band drift — migration of platform keys does not auto-fix church codes; log and reconcile separately |
| App still hardcodes `free` after data remap | Provision/assign failures — block deploy until code updated |
| Attempted `UPDATE plan_key` | Trigger raises `plan_key is immutable` — use insert/repoint path |

---

## 14. Whether `partner` should be retained inactive or mapped to network

| Option | Pros | Cons |
|--------|------|------|
| **A. Retain inactive `partner` row; remap only current/historical subscriptions to `network` optionally** | Safest; preserves audit of legacy key; matches seed “kept until migration” | Two Network-equivalent keys remain until retirement |
| **B. Map all `partner` subscriptions → `network`; mark `partner` retired** | Single commercial vocabulary | Loses distinct key in history unless mapping table kept |
| **C. Leave `partner` subscriptions on inactive partner plan indefinitely** | Zero entitlement change for those orgs | Blocks “one vocabulary” goal; resolver may treat inactive plan as fail-closed for new checks |

**Recommendation (non-destructive default):** **Option A** — keep `partner` row `inactive`/`retired`; **do not auto-delete**. Remap **current** `partner` subscriptions to `network` **only after** inventory shows counts and ops confirm those orgs should receive Network entitlements (features are identical in seed, but commercial/support posture may differ).

**Ambiguity remains** — do not ship a destructive partner drop in the first migration.

---

## 15. Whether `professional` should map to network automatically or require review

| Option | Pros | Cons |
|--------|------|------|
| **Automatic remap `professional` → `network`** | Display already Network; feature parity in seed; billing catalogue uses Network | Network is **assisted-only** for *new* assignment — remapping existing subs is still coherent commercially |
| **Review each org** | Catches mis-seeded or special deals | Slow; likely unnecessary if features are identical |

**Recommendation:** **Automatic remap for subscriptions** whose plan is `professional`, after feature-parity verification in staging. Treat this as **key rename**, not a new Network sale.

**Do not** interpret automatic remap as enabling self-serve Network assignment in platform-admin — that remains a separate product decision (`ASSIGNABLE` / assisted onboarding rules in the pricing doc).

---

## 16. Readiness verdict

| Question | Answer |
|----------|--------|
| Documentation ready? | **Yes** — this plan |
| Implementation ready to run in production? | **No** |
| Blockers | (1) Immutable `plan_key` requires insert/repoint design; (2) partner disposition (§14) unresolved for destructive path; (3) live inventory of `partner` / `professional` counts not captured here; (4) coordinated app cutover for hardcoded `free`; (5) dual church vs platform entitlement models |
| Safe next step | Staging: inventory queries + dry-run insert/repoint on a copy; product sign-off on §14–§15; then implement migration under a dated change request |

**Do not invent the final destructive migration SQL in-repo until §14–§15 are signed and staging rehearsal passes.**

---

## 17. Suggested documentation commit message

```
Document BlessBoard plan_key Phase B migration plan without executing data changes.
```

---

## Appendix A — Files inspected

| Path | Why |
|------|-----|
| `docs/product/BLESSBOARD_PRICING_DECISION.md` | Approved packages, Phase B outline, risks |
| `src/church/blessBoardPackageCatalogue.js` | Public codes + `LEGACY_PLAN_TO_PACKAGE` |
| `src/church/blessBoardBillingCatalogue.js` | Price book (foundation/growth/network) |
| `db/seeds/003_blessboard_plans.sql` | Current plan_key / features / partner inactive |
| `db/migrations/platform/013_create_plans_subscriptions_entitlements.sql` | Schema + **immutable plan_key** trigger |
| `src/platform/services/entitlementService.js` | Resolve / assign / limits |
| `src/platform/services/provisionPlatformTenant.js` | Default `planKey: "free"` |
| `src/platform/services/listPlatformPlansCatalogue.js` | Catalogue + legacy flag for partner |
| `src/platform/services/platformAdminEntitlements.js` | Admin assign/override |
| `src/migration/v4ToV5/mappers/helpers.js` | `mapPlanKey` → free/growth/professional/partner |
| `tests/platform-entitlements.test.js` | Assignment + limit enforcement |
| `tests/church-commercial-catalogue.test.js` | Alias / package codes |
| `tests/church-platform-pricing.test.js` | Public pricing codes |
| `tests/church-growth-billing.test.js` | Billing uses foundation/growth |
| `tests/blessboard-platform-admin-shell.test.js` | Admin plan/subscription UI keys |

## Appendix B — Hardcoded legacy keys to update in the implementation PR (not done here)

- `provisionPlatformTenant.js` → `foundation`  
- `mapPlanKey` / migration fixtures → approved keys  
- Seeds → insert `foundation` / `network` (and retire legacy)  
- Platform-admin / entitlement tests expecting `free` / `professional`
