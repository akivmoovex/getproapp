# BlessBoard plan_key migration plan (Phase B)

**Status:** Analysis / implementation-readiness — **NOT READY TO IMPLEMENT**  
**Date:** 2026-07-19 (readiness pass) · original analysis 2026-07-18  
**Authority:** [`docs/product/BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) §7–§8  
**Constraint:** This document does **not** implement schema, seed, runtime, or hosted-data changes. **No migration SQL files are created** while mapping ambiguities and approval gates remain open.

**Implementation readiness (this pass):** **NOT READY** — see §27.

---

## Goal

Reconcile persisted `platform.plans.plan_key` values with the approved public package vocabulary (`foundation` / `growth` / `network`) without inventing billing runtime or deleting ambiguous rows.

---

## 1. Current persisted keys

Source: `db/seeds/003_blessboard_plans.sql` + `platform.plans` / `platform.plan_features` / `platform.organization_subscriptions`.

| `plan_key` | Seed `display_name` | Seed `status` | Role today |
|------------|---------------------|---------------|------------|
| `free` | Foundation | `active` | Default provision key in `provisionPlatformTenant` (`planKey: "free"`) |
| `growth` | Growth | `active` | Same key as approved package; **no rename needed** |
| `professional` | Network | `active` | Commercial Network under legacy key; assignable by key in platform-admin |
| `partner` | Partner (legacy) | `inactive` | Retained for existing subscriptions; marked legacy in catalogue |

**Hard constraint:** `platform.plans.plan_key` is **immutable after insert** (`platform.prevent_plan_key_change` in `db/migrations/platform/013_create_plans_subscriptions_entitlements.sql`). In-place `UPDATE … SET plan_key = …` **fails**. Rename must **insert new rows and repoint FKs**.

**Entitlement resolver note:** `entitlementService.resolveOrganizationEntitlements` fail-closes (`reason: plan_inactive`, empty features) when `plan.status !== 'active'`. Any current subscription still pointing at inactive `partner` already loses plan features until remapped to an active plan.

---

## 2. Approved public packages

| Package | Code | List price | Capacity (package catalogue) |
|---------|------|------------|------------------------------|
| **Foundation** | `foundation` | USD 0 / month | Max 1 active branch; 250 members; 10 admin accounts |
| **Growth** | `growth` | USD 14.99 / active branch / month | Unlimited branches; fair-use members/admins |
| **Network** | `network` | USD 29.99 / active branch / month | Unlimited branches; custom domain + hosted mailboxes (assisted) |

Sources:

- `src/church/blessBoardPackageCatalogue.js` — `PACKAGE_CODES`, `BLESSBOARD_PACKAGES`, `LEGACY_PLAN_TO_PACKAGE`
- `src/church/blessBoardBillingCatalogue.js` — cents SoT (`1499` / `2999`); **no** `free` / `professional` / `partner` price rows
- Church assignable codes remain **Foundation + Growth only** (`ASSIGNABLE_PACKAGE_CODES`); Network is assisted/ops

Existing church alias map (`LEGACY_PLAN_TO_PACKAGE`):

```text
free         → foundation
standard/pro → growth
professional → network
partner      → network
foundation / growth / network → identity
```

---

## 3. Proposed mapping

| Current `plan_key` | Target `plan_key` | Automatic? | Notes |
|--------------------|-------------------|------------|-------|
| `free` | `foundation` | Yes (after feature parity) | Display already Foundation; provision default today |
| `growth` | `growth` | N/A | Identity — leave UUID/key unchanged |
| `professional` | `network` | Yes (after feature parity) | Display already Network; seed features match Network |
| `partner` | `network` (candidate) | **No — gated** | See §14 and §16; do not auto-delete |

### Physical approach (immutable keys)

1. **Insert** active rows if missing: `foundation`, `network` (keep existing `growth`).
2. **Copy** `plan_features` from `free`→`foundation`, `professional`→`network` (verify row-by-row).
3. **Repoint** `organization_subscriptions.plan_id` from legacy plan UUIDs to target UUIDs.
4. Mark legacy `free` / `professional` (and later `partner`) `inactive` or `retired` — **do not delete** during the first pass.
5. Same release: update seeds, provision default (`free`→`foundation`), V4→V5 `mapPlanKey`, tests, hardcoded lookups.

**Do not** ship a one-shot `UPDATE plan_key` script.

---

## 4. Existing subscription impact

| Area | Impact |
|------|--------|
| `organization_subscriptions.plan_id` | Repoint to new plan UUIDs; keep `status`, `starts_at`, `ends_at`, `notes` |
| Current-sub unique index | Remap in place; does not create duplicate current rows |
| Historical rows (`canceled`, `expired`, …) | Apply same key mapping for reporting consistency |
| Platform-admin UI | Already prefers `display_name`; after cutover keys read as `foundation` / `network` |
| Provisioning | Must switch default `planKey: "free"` → `"foundation"` in the **same** release as data remap |
| V4→V5 `mapPlanKey` | Today emits `free` / `growth` / `professional` / `partner`; must emit approved keys after cutover |

**Pre-flight:** inventory subscriptions by `plan_key` and status (§9) before any write.

---

## 5. Entitlement impact

### Platform (`entitlementService` + `plan_features`)

- Resolves by subscription → plan UUID → features; org overrides key by `feature_key` only (**no plan_key remap** for overrides).
- After `plan_id` remount + identical feature copy, effective limits/booleans stay the same.
- Incorrect feature copy (e.g. wrong `max_branches`) would change enforcement (`assertCanCreateBranch`, staff/user limits).

### Church package catalogue (separate model)

- Already on `foundation` / `growth` / `network` + aliases.
- **Not** auto-synced with `platform.plan_features`. Platform key migration does **not** expand platform features to the full church entitlement tree (storage, mailboxes, fair-use, etc.).

### Partner edge case

Leaving current subscriptions on inactive `partner` continues fail-closed entitlements (`plan_inactive`). Remapping those orgs requires deliberate product/ops choice (§14, §16).

---

## 6. Billing impact

| Layer | Today | Phase B effect |
|-------|-------|----------------|
| `blessBoardBillingCatalogue` | `foundation` / `growth` / `network` only | Unchanged |
| Payment provider / live invoices | **Not live** (Phase C) | Still out of scope |
| Draft invoice / growth billing tests | Church `plan_code` package codes | Prefer remapped/aliased codes; no new prices invented |
| Platform `plan_key` | Not in price book | Vocabulary alignment only — **not** a price change |

**Related but separate drift:** `db/postgres/098_church_growth_billing.sql` still seeds Growth at **1490¢** while the JS price book uses **1499¢**. Do **not** fold a price-book correction into the plan_key migration; track it as a separate billing readiness fix.

Residual risk: any join of platform `plan_key` to the price book without aliases could miss Foundation/Network if still looking for `free`/`professional`.

---

## 7. Alias compatibility period

Recommend **≥ one release** after data remap:

| Legacy key | Alias target | Retention |
|------------|--------------|-----------|
| `free` | `foundation` | Keep inactive/retired plan row **and/or** church catalogue alias |
| `professional` | `network` | Same |
| `partner` | `network` (if remapped) else retain inactive | Same |
| Church `plan_code` legacy values | Existing `LEGACY_PLAN_TO_PACKAGE` | Keep until optional church backfill completes |

During the window:

- **Reads** accept legacy keys (findPlanByKey / resolvePackageFromPlanCode).
- **Writes / new provision** use only `foundation` / `growth` / `network`.
- Do **not** expand self-serve Network assignment; Network remains assisted per pricing decision.

---

## 8. Idempotent migration design

Principles:

1. Detect target keys before insert (`WHERE plan_key IN (...)`).
2. Upsert features by `(plan_id, feature_key)`.
3. Update subscriptions only where `plan_id` still points at legacy UUIDs.
4. Re-run is a no-op when all current targets already remapped.
5. Persist a mapping table for rollback: `(old_plan_id, new_plan_id, old_plan_key, new_plan_key)`.
6. Never delete legacy plan rows in the first pass.

Illustrative sequence (not executable ship SQL):

```text
1. BEGIN
2. INSERT foundation / network IF NOT EXISTS (copy metadata from free / professional)
3. COPY plan_features free → foundation, professional → network (ON CONFLICT UPDATE)
4. UPDATE organization_subscriptions SET plan_id = foundation.id WHERE plan_id = free.id
5. UPDATE organization_subscriptions SET plan_id = network.id WHERE plan_id = professional.id
6. [GATED] partner → network remaps only for reviewed org list (§16)
7. SET free / professional status = inactive|retired
8. COMMIT
9. App release: provision default foundation; mapPlanKey; seeds; tests
```

---

## 9. Verification queries

Run before and after (staging + production window):

```sql
-- Catalogue inventory
SELECT plan_key, display_name, status, sort_order
  FROM platform.plans
 WHERE product_key = 'blessboard'
 ORDER BY sort_order, plan_key;

-- Feature parity (free vs foundation; professional vs network)
SELECT p.plan_key, f.feature_key, f.feature_kind, f.boolean_value, f.limit_value
  FROM platform.plan_features f
  JOIN platform.plans p ON p.id = f.plan_id
 WHERE p.plan_key IN ('free', 'foundation', 'professional', 'network')
 ORDER BY f.feature_key, p.plan_key;

-- Subscriptions by plan_key + status
SELECT p.plan_key, s.status, COUNT(*) AS n
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
 GROUP BY p.plan_key, s.status
 ORDER BY p.plan_key, s.status;

-- Current legacy keys after cutover (expect 0 for free/professional if remapped)
SELECT p.plan_key, COUNT(*)
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
 WHERE p.plan_key IN ('free', 'professional', 'partner')
   AND s.status IN ('active', 'trialing', 'past_due')
 GROUP BY p.plan_key;

-- Partner orgs needing review (any status)
SELECT o.organization_key, s.status, s.starts_at, s.ends_at, s.notes
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
  JOIN platform.organizations o ON o.id = s.organization_id
 WHERE p.plan_key = 'partner'
 ORDER BY s.status, o.organization_key;

-- Church plan_code distribution (separate church DB connection; optional)
-- SELECT plan_code, COUNT(*) FROM public.church_organizations GROUP BY 1 ORDER BY 1;
```

Application checks:

- New provision → subscription `plan_key = foundation`.
- Remapped orgs → same limits/booleans as pre-cutover snapshot.
- Platform-admin assign still CSRF + confirmation; Growth assign unchanged.
- Suites in §12 pass.

---

## 10. Rollback strategy

| Stage | Rollback |
|-------|----------|
| Before app deploy | Abort/revert migration transaction; subscriptions still on old `plan_id`s |
| After app deploy expecting new keys | Redeploy previous app build **and** remount subscriptions to legacy plan UUIDs via mapping table |
| After deleting legacy rows | **Not recoverable** without backup — deletion forbidden until alias period ends |

Require:

- Staging rehearsal with production-like subscription counts
- Snapshot/backup of `platform.plans`, `plan_features`, `organization_subscriptions`
- Explicit go / no-go after §9 queries

---

## 11. Deployment sequence

1. **Freeze** platform-admin plan assignment for the cutover window.
2. **Backup** platform plan/subscription/entitlement tables.
3. **Run inventory** (§9); archive results; complete §16 partner reviews.
4. **Apply data migration** (insert targets, copy features, remount `free`/`professional` subscriptions).
5. **Deploy application** in the same window: provision default `foundation`; `mapPlanKey`; seeds; tests; catalogue expectations.
6. **Verify** (§9); smoke platform-admin plans/subscriptions/org entitlements.
7. **Lift** assignment freeze.
8. Keep **alias period** (≥1 release).
9. Later (separate CR): retire/delete legacy keys only after zero current legacy subscriptions and product sign-off.

Church `plan_code` backfill remains **optional parallel** work (aliases already cover reads).

---

## 12. Tests required

| Suite / area | Expectation when implementation ships |
|--------------|----------------------------------------|
| `tests/platform-entitlements.test.js` | Catalogue keys include `foundation`/`network`; assign Network via `network`; keep Foundation `max_branches = 1`; keep immutability test |
| `tests/blessboard-platform-admin-shell.test.js` | Plan/subscription markers use approved keys + display names |
| `tests/church-commercial-catalogue.test.js` | Alias map still covers legacy during alias period |
| `tests/church-package-entitlements.test.js` / assignment | Church codes unchanged; Network still non-assignable in admin UI |
| `tests/church-growth-billing.test.js` / pricing | Package codes remain foundation/growth/network; no invented prices |
| V4→V5 `mapPlanKey` + migration mapping tests | Emit approved keys; quarantine unknowns |
| Provisioning | New orgs get `foundation` subscription |
| Idempotency | Migration re-run leaves subscription counts unchanged |
| Feature parity | Diff legacy vs target feature sets empty after copy |

Do **not** weaken limit-enforcement tests.

---

## 13. Conflict handling

| Conflict | Handling |
|----------|----------|
| Target `foundation` / `network` already exists with different features | **Stop**; human review feature diff before remapping subscriptions |
| Subscription points at missing plan | Quarantine org; do not invent a plan |
| Both `professional` and `partner` current for same org | Impossible under current-sub unique index; historical rows remap independently |
| Church `plan_code=network` but platform sub still `free` | Out-of-band drift — platform key migration does not auto-fix church codes; log and reconcile separately |
| App still hardcodes `free` after data remap | Provision/assign failures — block deploy until code updated |
| Attempted `UPDATE plan_key` | Trigger raises immutability error — use insert/repoint only |
| Feature parity mismatch between seed copies | Abort remount; fix features; re-verify |

---

## 14. Treatment of inactive `partner`

| Option | Pros | Cons |
|--------|------|------|
| **A. Retain inactive `partner` row; remap reviewed current subscriptions to `network`** | Safest commercial alignment; preserves audit key until retirement | Requires §16 review list |
| **B. Map all `partner` subscriptions → `network` automatically; mark `partner` retired** | Single vocabulary quickly | May conflate historically distinct partner deals |
| **C. Leave subscriptions on inactive `partner` indefinitely** | Zero write risk | Blocks vocabulary goal; **fail-closed entitlements** today |

**Recommendation (non-destructive default):** **Option A**. Keep the `partner` row. Do **not** auto-delete. Remap current `partner` subscriptions to active `network` **only** after inventory + ops/product confirmation (§16). Seed features for `partner` and `professional` are identical, but commercial/support posture may differ.

**Ambiguity remains** — do not ship a destructive partner drop in the first migration.

---

## 15. Treatment of `professional`

| Option | Pros | Cons |
|--------|------|------|
| **Automatic remap `professional` → `network`** | Display already Network; seed feature parity; billing catalogue uses Network | Network is assisted-only for *new* assignment — remapping existing subs is still a rename, not a sale |
| **Per-org review** | Catches mis-seeded or special deals | Slow; likely unnecessary if features match |

**Recommendation:** **Automatic remap** for subscriptions on `professional` after staging feature-parity verification. Treat as **key rename**, not a new Network sale.

**Do not** interpret remap as enabling self-serve Network assignment (`ASSIGNABLE_PACKAGE_CODES` / assisted onboarding rules stay as in the pricing decision).

---

## 16. Whether manual review is needed for any subscription

| Cohort | Manual review? | Rationale |
|--------|----------------|-----------|
| Current `free` | **No** (bulk) | Commercial Foundation; feature parity expected |
| Current `growth` | **No** | Identity key |
| Current `professional` | **No** (bulk after feature parity) | Display already Network; rename only |
| Current / historical `partner` | **Yes** | Inactive plan fail-closes entitlements; partner may encode special deals; remap only with signed org list |
| Orgs with active entitlement overrides | **Spot-check** | Overrides survive remount; verify effective limits still match intent |
| Church `plan_code` vs platform `plan_key` drift | **Yes if inventory finds mismatches** | Separate reconciliation; do not invent auto-fix in Phase B |
| Missing plan / broken `plan_id` | **Yes — quarantine** | Do not invent a plan |

**Gate for execution:** Phase B implementation may remount `free`→`foundation` and `professional`→`network` automatically **only after** staging parity passes. Partner remounts require an explicit reviewed org list (or an explicit product decision to leave them untouched until a later CR).

---

## 17. Exact preflight checks (must all PASS before writing SQL)

Run against the **intended target** (staging clone first; hosted only under §25). Capture outputs (keys/counts only — no secrets).

| # | Check | Pass criteria |
|---|-------|---------------|
| PF1 | Identity | `platform.database_identity.identity_key` matches expected (e.g. `blessboard-platform-v5`); env code known |
| PF2 | Backup | Snapshot/backup of `platform.plans`, `plan_features`, `organization_subscriptions`, `organization_entitlements` ≤24h and restorable |
| PF3 | Seed catalogue shape | `blessboard` plans include exactly the expected legacy set **or** documented deltas: `free`, `growth`, `professional`, `partner` (see conflict if extra/missing) |
| PF4 | Immutability trigger | `plans_plan_key_immutable` present; prove `UPDATE plan_key` fails in staging |
| PF5 | Feature parity free↔Foundation intent | Diff of `(feature_key, feature_kind, boolean_value, limit_value)` for `free` vs proposed Foundation feature set is empty **or** signed waiver |
| PF6 | Feature parity professional↔Network intent | Same for `professional` vs Network |
| PF7 | Subscription inventory | Counts by `plan_key` × `status` archived (§18 queries) |
| PF8 | Partner inventory | Full org list for `plan_key=partner` archived; §16 review complete or explicit “leave untouched” sign-off |
| PF9 | Orphan / broken FKs | Zero subscriptions with missing `plan_id`; zero plans without `product_key=blessboard` incorrectly referenced by BlessBoard subs |
| PF10 | Current-sub uniqueness | No org has >1 current (`active`/`trialing`/`past_due`) BlessBoard subscription (index already enforces; still report) |
| PF11 | App hardcodes inventory | Known writers still on `free` / `professional` listed (Appendix B) — cutover PR scoped |
| PF12 | Assignment freeze | Platform-admin plan assignment freeze window scheduled |
| PF13 | Manual approval gate | §26 signed |

**Stop if any PF fails.** Do not author production migration SQL until PF1–PF13 pass on staging.

---

## 18. Conflict queries (inventory / blockers)

```sql
-- PF3 catalogue
SELECT plan_key, display_name, status, sort_order, id
  FROM platform.plans
 WHERE product_key = 'blessboard'
 ORDER BY sort_order, plan_key;

-- Unexpected plan keys (anything outside known set)
SELECT plan_key, status, COUNT(*) OVER () AS catalogue_rows
  FROM platform.plans
 WHERE product_key = 'blessboard'
   AND plan_key NOT IN ('free', 'growth', 'professional', 'partner', 'foundation', 'network');

-- Target keys already present (duplicate-key scenario precursor)
SELECT plan_key, id, status, display_name
  FROM platform.plans
 WHERE plan_key IN ('foundation', 'network');

-- Feature parity: free vs foundation (after foundation exists; pre-insert compare free to seed intent)
SELECT f.feature_key, f.feature_kind, f.boolean_value, f.limit_value
  FROM platform.plan_features f
  JOIN platform.plans p ON p.id = f.plan_id
 WHERE p.plan_key = 'free'
 ORDER BY f.feature_key;

-- Subscriptions by plan + status
SELECT p.plan_key, s.status, COUNT(*) AS n
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
 WHERE s.product_key = 'blessboard'
 GROUP BY p.plan_key, s.status
 ORDER BY p.plan_key, s.status;

-- Current legacy keys (active-like)
SELECT p.plan_key, o.organization_key, s.status, s.id AS subscription_id
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
  JOIN platform.organizations o ON o.id = s.organization_id
 WHERE p.plan_key IN ('free', 'professional', 'partner')
   AND s.status IN ('active', 'trialing', 'past_due')
 ORDER BY p.plan_key, o.organization_key;

-- Partner all statuses (review list)
SELECT o.organization_key, o.status AS org_status, s.status AS sub_status,
       s.starts_at, s.ends_at, left(coalesce(s.notes, ''), 80) AS notes_prefix
  FROM platform.organization_subscriptions s
  JOIN platform.plans p ON p.id = s.plan_id
  JOIN platform.organizations o ON o.id = s.organization_id
 WHERE p.plan_key = 'partner'
 ORDER BY s.status, o.organization_key;

-- Orphan plan_id (should be 0)
SELECT s.id, s.organization_id, s.plan_id
  FROM platform.organization_subscriptions s
  LEFT JOIN platform.plans p ON p.id = s.plan_id
 WHERE p.id IS NULL;

-- Orgs with entitlement overrides (spot-check list)
SELECT o.organization_key, e.feature_key, e.boolean_value, e.limit_value, e.status
  FROM platform.organization_entitlements e
  JOIN platform.organizations o ON o.id = e.organization_id
 WHERE e.status = 'active'
 ORDER BY o.organization_key, e.feature_key;
```

---

## 19. Duplicate-key scenarios

| Scenario | Detection | Required action |
|----------|-----------|-----------------|
| `foundation` already exists | PF3 / conflict query | **Stop.** Diff features vs `free`. If identical → remount-only path. If different → human fix before any remount |
| `network` already exists | Same | Same vs `professional` |
| Insert `foundation` while legacy `free` remains | Expected during migration | Allowed — `plan_key` UNIQUE is global; both rows coexist until legacy inactivated |
| Accidental second insert of `foundation` | UNIQUE (`plan_key`) | Migration must be idempotent (`IF NOT EXISTS` / ON CONFLICT do nothing on plan row) |
| Seed re-run after cutover still upserts `free` | Seed `ON CONFLICT (plan_key)` | Cutover PR must **change seeds** in same release so new environments get `foundation`/`network` as SoT |
| Church package code `network` vs platform sub still `free` | Separate inventory | Do **not** auto-fix church `plan_code` in Phase B |

---

## 20. Subscription mapping rules

| Source `plan_key` | Target `plan_key` | Which rows | Automatic? |
|-------------------|-------------------|------------|------------|
| `free` | `foundation` | All statuses (`active`/`trialing`/`past_due`/`canceled`/`expired`/`inactive`) | **Yes** after PF5 |
| `growth` | `growth` | All | **No-op** (same UUID) |
| `professional` | `network` | All statuses | **Yes** after PF6 + §15 rules |
| `partner` | `network` | Only orgs on **signed review list** | **Gated** — default leave on inactive `partner` |
| Unknown / orphan | — | Quarantine | **Never invent** |

Additional rules:

1. Remount updates **`plan_id` only** — preserve `status`, `starts_at`, `ends_at`, `notes`, `organization_id`, `product_key`.  
2. Do not create a second current subscription; remount in place.  
3. Historical rows remount for reporting consistency even when not current.  
4. After remount, zero current subs may remain on `free` / `professional`.  
5. `partner` current subs left on inactive plan remain **fail-closed** for entitlements until remounted (known behavior).

---

## 21. Professional → Network review rules

| Rule | Detail |
|------|--------|
| Commercial meaning | Treat as **key rename**, not a new Network sale or self-serve unlock |
| Feature gate | PF6 must PASS (seed/live features match Network intent: unlimited branches, custom_domain/email true, etc.) |
| Assignment policy | Remount does **not** add `network` to church `ASSIGNABLE_PACKAGE_CODES` |
| Bulk remount | Allowed for all `professional` subscriptions after PF6 |
| Stop conditions | Feature mismatch; `network` row exists with divergent features; app still cannot resolve `network` |

---

## 22. Partner treatment

| Decision | Status |
|----------|--------|
| Keep `partner` row | **Required** for first pass (no delete) |
| Mark status | Prefer `inactive` (already seed default) or later `retired` — **product chooses**; both allowed by CHECK |
| Auto-remount all → `network` | **Not approved** while ambiguity remains |
| Remount subset | Only signed org list (§16 Option A) |
| Leave untouched | Explicit product waiver allowed; document ongoing fail-closed entitlements |

**Ambiguity remaining:** whether any live `partner` subscription encodes a commercial deal that must **not** become Network. Until inventory + sign-off, partner remount SQL must not ship.

---

## 23. Inactive-plan treatment

| Plan after cutover | Recommended status | Resolver behavior |
|--------------------|--------------------|-------------------|
| `free` | `inactive` or `retired` | Must not be selected for **new** provision; keep row for alias/audit |
| `professional` | `inactive` or `retired` | Same |
| `partner` | remain `inactive` (or `retired` later) | Fail-closed if any sub still points here |
| `foundation` / `growth` / `network` | `active` | Normal |

`entitlementService` fail-closes when `plan.status !== 'active'`. Therefore **never** inactivate a plan while current subscriptions still reference it.

Order: **remount subscriptions first**, then mark legacy plans inactive/retired in the same transaction (or immediately after with verification).

---

## 24. Transaction boundaries, checkpointing, idempotent rerun

### Migration framework conventions

- Foundation migrator (`db/scripts/lib/migrator.js`): each SQL file runs in **its own BEGIN/COMMIT**; checksum-locked; re-run skips applied versions.  
- Phase B should be **one** (or few) numbered `db/migrations/platform/NNN_*.sql` file(s) plus **same-release** app/seed changes — not ad-hoc hosted SQL pads.  
- Do **not** use V4→V5 `migrate:v4-to-v5` tooling for this rename.

### Proposed transaction boundaries (design — not shipped SQL)

| Step | Boundary | Contents |
|------|----------|----------|
| T1 | Single transaction | Insert `foundation`/`network` if missing; copy features; write mapping audit rows |
| T2 | Single transaction | Remount `free`→`foundation`, `professional`→`network` subscription `plan_id`s; optional gated partner list |
| T3 | Single transaction | Set legacy `free`/`professional` (and optionally reviewed partner) to `inactive`/`retired` |
| T4 | App deploy | Outside DB txn — provision default, `mapPlanKey`, seeds, tests |

Prefer **T1+T2+T3 in one migrator file / one transaction** if the file stays short enough for ops review; if split, checkpoint between files via `schema_migrations` and verify §18 after each.

### Checkpointing

| Checkpoint | Evidence |
|------------|----------|
| C0 | Preflight PF1–PF13 archive |
| C1 | After plan insert: both targets exist; feature parity query empty |
| C2 | After remount: zero current subs on `free`/`professional`; partner per policy |
| C3 | After legacy inactive: no current sub references inactive plan |
| C4 | After app deploy: new provision → `foundation`; smoke PA plans |

### Idempotent rerun behavior

| Operation | Idempotent behavior |
|-----------|---------------------|
| Insert plans | Skip if `plan_key` exists |
| Copy features | `ON CONFLICT (plan_id, feature_key) DO UPDATE` to match source snapshot |
| Remount subs | `UPDATE … WHERE plan_id = <legacy>` — second run updates 0 rows |
| Inactivate legacy | `UPDATE … WHERE status = 'active' AND plan_key IN (…)`` — second run no-op |
| Mapping audit table | Upsert by `old_plan_id` |

---

## 25. Rollback limitations & hosted dry-run

### Rollback limitations

| Situation | Possible? |
|-----------|-----------|
| Abort before COMMIT of remount | **Yes** — DB rollback |
| After COMMIT, before app deploy | Remount back to legacy UUIDs via mapping table **if legacy rows still active** |
| After legacy marked inactive + app expects new keys | Requires coordinated app rollback **and** remount to legacy; high risk |
| After legacy plan **deleted** | **Not recoverable** without backup — deletion forbidden in Phase B |
| Seed/app already on `foundation` only | Rolling back data without rolling back app breaks provision |

**Limitation:** There is no automatic reverse migrator. Rollback is restore-from-backup or scripted remount using the mapping table under incident command.

### Hosted dry-run procedure (no production apply)

1. Clone/restore hosted V5 **testing** DB to a disposable staging database (or use approved staging project).  
2. Set `DATABASE_URL` + `DATABASE_IDENTITY_EXPECTED` to the **clone** only.  
3. Run PF1–PF12 queries; archive.  
4. Apply candidate migration SQL **only on the clone**.  
5. Re-run §18 verification; run platform entitlement + PA shell tests against clone if feasible.  
6. Practice rollback once on clone.  
7. Destroy clone or mark non-production.  
8. **Do not** run apply against live Hostinger/Supabase until §26 approval.

Note: `migrate:v4-to-v5:dry-run` is **unrelated** (V4 church → V5 loader). Do not confuse toolchains.

---

## 26. Manual approval gate

Phase B implementation and hosted apply require **written** approval covering:

| Gate | Approver type | Must affirm |
|------|---------------|-------------|
| G1 Product vocabulary | Product | `foundation`/`growth`/`network` remain SoT; Network stays assisted-only for new assign |
| G2 Partner disposition | Product + Ops | Option A/B/C from §14 with org list or “leave untouched” |
| G3 Feature parity | Engineering | PF5/PF6 evidence attached |
| G4 Cutover window | Ops | Freeze assignment; backup; rollback owner named |
| G5 App coordination | Engineering | Same-release provision/`mapPlanKey`/seeds/tests PR linked |
| G6 Hosted apply | Leadership/Ops | Explicit “apply to \<project\>” — not implied by merging docs |

**No signed G1–G6 ⇒ NOT READY TO IMPLEMENT.**

---

## 27. Test fixture requirements (when implementation is approved)

| Fixture need | Requirement |
|--------------|-------------|
| Plans | Tests must create/expect `foundation`/`network` after cutover; keep immutability test |
| Subscriptions | Org with `free` remounts to `foundation`; `professional` → `network` |
| Partner | Fixture for fail-closed inactive; optional reviewed remount case |
| Idempotency | Re-apply migration / second remount → stable counts |
| Provision | New org subscription `plan_key=foundation` |
| Aliases | Church catalogue still maps `free`/`professional`/`partner` during alias period |
| V4→V5 | `mapPlanKey` emits approved keys post-cutover; update fixtures warnings |
| Negative | Attempt `UPDATE plan_key` still fails |

Do not weaken branch/user limit tests.

---

## 28. Readiness verdict

| Question | Answer |
|----------|--------|
| Mapping confidence `free`→`foundation` | **HIGH** (seed display + features align; provision still hardcodes `free`) |
| Mapping confidence `growth` | **HIGH** (identity) |
| Mapping confidence `professional`→`network` | **HIGH** for rename after feature parity proof; **policy** must keep Network assisted |
| Mapping confidence `partner`→`network` | **LOW–MEDIUM** — commercially ambiguous; gated |
| Documentation for implementers | **Strong** (this plan) |
| **READY TO IMPLEMENT?** | **NOT READY** |

### Remaining ambiguity

1. Partner disposition (remap list vs leave fail-closed) unsigned.  
2. Live/staging subscription inventories not attached to this doc.  
3. Live feature parity not yet evidenced beyond seed file review.  
4. Choice of legacy status `inactive` vs `retired` for `free`/`professional`.  
5. Exact migrator packaging (one txn vs split files) not signed by Ops.  
6. Dual church `plan_code` vs platform `plan_key` drift handling deferred (aliases only).

### Required manual decisions

- G1–G6 approval gate (§26).  
- Partner Option A/B/C (§14).  
- Legacy plan terminal status (`inactive` vs `retired`).  
- Whether historical-only `partner` rows remount or stay.

### Data conflicts that could block migration

- Pre-existing divergent `foundation`/`network` rows.  
- Feature parity mismatch free/professional vs targets.  
- Orphan `plan_id`s.  
- Unexpected plan keys in catalogue.  
- Current subscriptions still on plans about to be inactivated (ordering bug).  
- App still provisioning `free` after data remount.

### Safe next steps (still no SQL ship)

1. Run §18 inventory on staging/hosted **read-only**.  
2. Complete partner review / waiver.  
3. Sign G1–G6.  
4. Only then author migration SQL + app PR under a dated CR.

**Do not invent a destructive migration while ambiguity remains.**

---

## Suggested documentation commit message

```
docs(migrations): deepen plan-key Phase B implementation readiness

Add preflight, conflict queries, mapping rules, transaction/rollback limits, and hosted dry-run gates; verdict remains NOT READY.
```

---

## Appendix A — Files inspected

| Path | Why |
|------|-----|
| `docs/product/BLESSBOARD_PRICING_DECISION.md` | Approved packages, Phase B outline, risks |
| `src/church/blessBoardPackageCatalogue.js` | Public codes + `LEGACY_PLAN_TO_PACKAGE` |
| `src/church/blessBoardBillingCatalogue.js` | Price book (foundation/growth/network) |
| `db/seeds/003_blessboard_plans.sql` | Current plan_key / features / partner inactive |
| `db/migrations/platform/013_create_plans_subscriptions_entitlements.sql` | Schema + immutable `plan_key` trigger |
| `db/postgres/098_church_growth_billing.sql` | Separate Growth cents seed (1490) vs JS 1499 |
| `src/platform/services/entitlementService.js` | Resolve / assign / limits; inactive plan fail-closed |
| `src/platform/services/provisionPlatformTenant.js` | Default `planKey: "free"` |
| `src/platform/services/listPlatformPlansCatalogue.js` | Catalogue + partner legacy flag |
| `src/platform/services/platformAdminEntitlements.js` | Admin assign/override |
| `src/platform/repositories/entitlementRepository.js` | Plan/subscription lookups |
| `src/services/church/churchPackageAssignmentService.js` | Assignable foundation/growth only |
| `src/migration/v4ToV5/mappers/helpers.js` | `mapPlanKey` → free/growth/professional/partner |
| `tests/platform-entitlements.test.js` | Assignment + limit enforcement + immutability |
| `tests/blessboard-platform-admin-shell.test.js` | Admin plan/subscription UI keys |
| `tests/church-commercial-catalogue.test.js` | Alias / package codes |
| `tests/church-package-entitlements.test.js` | Church alias + assignment rules |
| `tests/church-package-assignment.test.js` | Assignable codes |
| `tests/church-growth-billing.test.js` | Billing uses foundation/growth |

## Appendix B — Hardcoded legacy keys to update in the implementation PR (not done here)

- `provisionPlatformTenant.js` → `foundation`
- `mapPlanKey` / V4→V5 fixtures → approved keys
- Seeds → insert `foundation` / `network` (retire legacy after alias period)
- Platform-admin / entitlement tests expecting `free` / `professional`
- `listPlatformPlansCatalogue` legacy heuristic currently special-cases `partner`
