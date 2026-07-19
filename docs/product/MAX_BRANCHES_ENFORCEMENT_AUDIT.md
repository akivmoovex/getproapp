# Max branches enforcement audit (BlessBoard V5)

**Date:** 2026-07-19 (updated same day — BB-01 shipped)  
**Branch:** `V5`  
**Mode:** Audit + implementation notes  
**Commercial SoT:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · `db/seeds/003_blessboard_plans.sql` · `src/church/blessBoardPackageCatalogue.js`  
**Constraint:** No schema invention unless unavoidable.

---

## Executive verdict

| Question | Answer |
|----------|--------|
| Is there a V5 entitlement key for the cap? | **Yes** — `max_branches` |
| Is create gated in a service? | **Yes** — `createBlessBoardBranch` → `evaluateBranchCreateLimit` |
| Is reactivation gated in V5? | **Yes** — `activateBlessBoardBranch` |
| Does plan downgrade block when over limit? | **Yes** — `assignOrganizationPlan` → `evaluateTargetPlanBranchCapacity` (no auto-deactivate) |
| Is HQ provision insert gated? | **Yes** — new HQ insert calls `evaluateBranchCreateLimit` |
| Schema change required? | **No** |

**Remaining bypasses (by design):** raw SQL / V4→V5 import / test fixtures. Wire any future HQ create UI to `createBlessBoardBranch` only.

---

## 1. Current entitlement key

| Layer | Key / path | Notes |
|-------|------------|-------|
| V5 platform plans | `max_branches` (`FEATURE_KEYS.MAX_BRANCHES`) | `platform.plan_features`; used by `entitlementService` |
| Church package catalogue (commercial display + V4 policy) | `branches.max_active` | `blessBoardPackageCatalogue` → `FOUNDATION_ACTIVE_BRANCHES = 1` |
| Legacy V4 helpers | `limits.max_branches` in `churchPlans.js` | Parallel legacy model; **not** the V5 runtime SoT |

**V5 write gate API:** `evaluateBranchCreateLimit` / `assertCanCreateBranch` in `src/platform/services/entitlementService.js`.  
**V5 create service:** `src/blessboard/services/createBlessBoardBranch.js` (calls `evaluateBranchCreateLimit` inside the same transaction as `INSERT`).

---

## 2. Current stored limit values

From `db/seeds/003_blessboard_plans.sql` (`NULL` limit_value = unlimited):

| `plan_key` | Display | `max_branches` |
|------------|---------|----------------|
| `free` | Foundation | **1** |
| `growth` | Growth | **NULL** (unlimited) |
| `professional` | Network | **NULL** (unlimited) |
| `partner` | Partner (legacy inactive) | **NULL** (unlimited) |

Catalogue mirror (`blessBoardPackageCatalogue`): Foundation `branches.max_active = 1`; Growth/Network `UNLIMITED`.

---

## 3. How active branches are counted (V5)

`entitlementRepository.countActiveBranchesForOrganization`:

```sql
SELECT COUNT(b.id)::int
  FROM blessboard.branches b
  INNER JOIN blessboard.churches c ON c.id = b.church_id
 WHERE c.organization_id = $1
   AND b.status = 'active'
   AND c.status = 'active'
```

- Counts **all** `blessboard.branches` with `status = 'active'` under active churches for the org.
- Does **not** filter `branch_type`, `is_primary`, or billing flags.
- Limit check: `isWithinLimit(ent, max_branches, current, additional=1)` → allow if `current + 1 <= limit`, or always if `limit == null`.

---

## 4. Whether HQ is excluded

| Concern | Behavior |
|---------|----------|
| **Capacity (`max_branches`)** | HQ / primary **is included**. After `provisionBlessBoardChurch`, Foundation already has **1** active branch (the HQ row). A second active create is blocked by `createBlessBoardBranch`. |
| **Billing (“HQ is never counted as a billed branch”)** | Means there is **no separate HQ invoice line**; Growth/Network bill **active branch rows**. Capacity counting and billing unit are not the same concept. |

### SoT wording note

Approved pricing: Foundation has **1 HQ** and **maximum 1 active branch**. Seed copy: *“1 HQ, maximum 1 active branch”*.

That means **one active branch row total** (normally the HQ branch created at provision), **not** “1 HQ + 1 non-HQ campus.” Code matches the seed/pricing capacity reading. Any product intent to allow one non-HQ campus in addition to HQ would require an explicit SoT change (and a count that excludes `branch_type = 'hq'` or similar) — **out of scope for this audit**.

---

## 5. Entry-point matrix

| Entry point | Creates branch | Activates branch | Reads entitlement | Counts HQ | Enforced | Risk |
|-------------|----------------|------------------|-------------------|-----------|----------|------|
| `provisionBlessBoardChurch` / `insertHqBranch` (CLI `blessboard:church:provision`) | Yes (HQ only, `branch_type=hq`, `active`) | Creates already active | **No** | Yes (becomes the one Foundation slot) | **Soft / implicit** — only creates first HQ; no `evaluateBranchCreateLimit` | Low for normal first provision; medium if re-run against org that already has non-HQ actives (rare) |
| `createBlessBoardBranch` | Yes (`branch_type=branch`, always `active`) | Creates already active | **Yes** (`evaluateBranchCreateLimit` + `FOR UPDATE` on subscription) | Yes | **Yes** (when called) | **None if this is the only create path** — but **no production caller** today |
| HQ Admin UI `/hq/branches` | **No** (create explicitly unavailable) | No | N/A | N/A | N/A (honest unavailable copy) | Low until create UI is added |
| Platform-admin org detail / plan assign | No branch create | No | Plan assign does not check branch count | N/A | **Downgrade not gated** | High honesty gap (see §9) |
| Platform-admin entitlement override (`max_branches`) | Indirect | N/A | Yes (override raises limit) | Yes | Override works with create service | Low — intended escape hatch |
| V5 branch reactivation service | — | **Missing** | — | — | **No** | High if ops/SQL/tests set `status='active'` |
| Raw SQL / test fixtures `INSERT`/`UPDATE blessboard.branches` | Yes | Yes | No | Yes | **No** | Test/ops bypass only unless reused in scripts |
| V4→V5 migration `loadPg.applyBranch` | Yes (imports status as-is) | Via imported status | **No** | Yes | **Exception by design** | Medium — can import Foundation over-limit state |
| V4 `branchActivationPolicyService` / HQ add-branch (legacy `public.church_*`) | Yes (draft under Foundation) | Yes (gated + `FOR UPDATE` siblings) | Catalogue `branches.max_active` | Counts all active V4 rows | **Yes on V4 paths** | Parallel system — does **not** protect `blessboard.branches` |
| V4 `evaluateFoundationDowngradeEligibility` | No | No | Catalogue limits | Counts V4 actives | Blocks V4 Growth→Foundation assign when over | Does **not** run for V5 `assignOrganizationPlan` |

---

## 6. Foundation enforcement gaps

1. **No production create wiring** — `createBlessBoardBranch` is only required from `tests/platform-entitlements.test.js`. HQ create UI is intentionally absent. When create is added, it **must** call this service (not raw INSERT).
2. **No V5 activation / reactivation gate** — inactive→active can be done with SQL (and any future route) without `max_branches`.
3. **Always-active create** — V5 create inserts `status='active'` only; there is no Foundation “create as draft” path like V4 `resolveCreateBranchLifecycle`.
4. **Provision path skips entitlement read** — acceptable for first HQ under empty org; not a general create gate.
5. **V5 downgrade does not enforce eligibility** — `assignOrganizationPlan` to `free` succeeds even with `active_count > 1` (tests assert branches are **not** deleted).

---

## 7. Growth / Network unlimited handling

| Plan | `max_branches` | `isWithinLimit` |
|------|----------------|-----------------|
| Growth (`growth`) | `null` | Always allow |
| Network (`professional`) | `null` | Always allow |

No artificial cap in V5 entitlement path. Fair-use is commercial language only — not a hard limit.

---

## 8. Reactivation edge cases

| Case | V5 today |
|------|----------|
| Inactive → active via dedicated service | **No service** |
| Concurrent reactivation | N/A (no service); V4 locks sibling rows |
| Reactivate while Foundation already at 1 active | **Possible via SQL** → over-limit |
| Archive → active | No V5 lifecycle mirror of V4 “archived cannot reactivate” |

**Required for honesty:** a single V5 `activateBlessBoardBranch` (or shared helper) that reuses `evaluateBranchCreateLimit` / count semantics with `excludeBranchId` before setting `status='active'`.

---

## 9. Downgrade edge cases

| Path | Behavior |
|------|----------|
| V5 `assignOrganizationPlan` → `free` | Updates subscription plan only. **Does not** call eligibility. **Does not** deactivate excess branches. New creates blocked (`assertCanCreateBranch` fails). Existing over-limit actives **remain**. |
| V4 `evaluateFoundationDowngradeEligibility` + package assignment | Blocks when `activeBranches > 1` (and members/admins/jobs). Operators must deactivate first. |
| Pricing SoT | Growth→Foundation requires active branches ≤ 1 before assignment |

**Gap:** V5 platform-admin plan assignment can place a church on Foundation while still operating multiple active campuses.

---

## 10. Concurrent creation risk

| Pattern | Risk |
|---------|------|
| Two parallel `createBlessBoardBranch` on same org | **Low** — both take `FOR UPDATE` on `platform.organization_subscriptions` in the create transaction before count+insert |
| `assertCanCreateBranch` then separate INSERT | **High TOCTOU** — assert commits and releases lock before insert. Prefer `evaluateBranchCreateLimit` **inside** the insert transaction (as `createBlessBoardBranch` does) |
| Reactivation without locks | **High** if added without `FOR UPDATE` on church branches / subscription |

---

## 11. Migration / import exceptions

| Path | Behavior | Recommendation |
|------|----------|----------------|
| `src/migration/v4ToV5/loadPg.js` `applyBranch` | Inserts branch with source `status`; no entitlement check | Keep as **import exception**; post-migrate report orgs where `active_count > plan max_branches` |
| Rehearsal / seed scripts | May INSERT actives directly | Ops-only; do not use as product create path |

Do **not** invent schema for migration; add a verification query/report in the migrate verify step if needed.

---

## 12. Required tests (for the future fix batch)

| # | Assertion |
|---|-----------|
| T1 | Foundation after provision: active count = 1; `createBlessBoardBranch` → `limit_exceeded` |
| T2 | Growth: create second/third active succeeds |
| T3 | Network (`professional`): create second active succeeds |
| T4 | Foundation: activate inactive while one active exists → denied (once activate service exists) |
| T5 | Foundation: deactivate one, then activate another → allowed |
| T6 | Concurrent dual create under Foundation → exactly one success (or both fail safely with ≤1 active) |
| T7 | `assignOrganizationPlan` Growth→Foundation with 2+ actives → **blocked** (or soft warn + hard block per product decision) without deleting branches |
| T8 | Migration import over-limit → verify reports exception; runtime create still blocked |
| T9 | HQ included in count (second campus blocked when HQ active) |
| T10 | Override `max_branches` raises cap without changing `plan_key` (already covered) |

Existing coverage: `tests/platform-entitlements.test.js` covers T1-ish, Growth unlimited via override/professional, and “downgrade does not delete” — **not** “downgrade blocked when over.”

---

## 13. Recommended implementation batch (do not start here)

**Name:** `BATCH_MAX_BRANCHES_ENFORCEMENT` (or FG capacity batch)

**Schema:** **Not required.**

**Code (suggested only):**

1. Keep `createBlessBoardBranch` as the **only** campus create entry; wire any future HQ/CLI create UI to it.
2. Add `activateBlessBoardBranch` / `setBlessBoardBranchStatus` that:
   - locks subscription (and/or church branches) like create;
   - counts actives excluding self;
   - applies `max_branches` before `UPDATE status = 'active'`.
3. Add V5 downgrade eligibility check before `assignOrganizationPlan` when target plan has finite `max_branches` (mirror pricing SoT; do not auto-deactivate).
4. Optionally call `evaluateBranchCreateLimit` from `insertHqBranch` when active count already ≥ 1 (defensive).
5. Document migration as the sole intentional bypass; add verify query.
6. Expand tests per §12.

**Non-goals for that batch:** billing checkout, renaming `plan_key`, Network assignment UI, inventing draft-branch schema unless product requires Foundation draft campuses.

---

## 14. Dual-system caution

| System | Tables | Enforcement |
|--------|--------|-------------|
| **V5 BlessBoard** | `blessboard.branches` + `platform.*` entitlements | Partial (create service only; unused by UI) |
| **V4 Church** | `public.church_branches` + package catalogue | Stronger create/activate/downgrade for legacy routes |

Do **not** assume V4 `branchActivationPolicyService` protects V5 tenants. Future work should enforce on **V5** boundaries only for BlessBoard V5 product.

---

## 15. Focused verification run (this audit)

| Command | Result |
|---------|--------|
| `npm run test:platform:entitlements` | **10 pass / 0 fail** |
| `npm run test:blessboard:catalogue` | **15 pass / 0 fail** |
| `node --test tests/church-package-entitlements.test.js` | **14 pass / 0 fail / 2 skipped** |
| `node --test tests/church-commercial-catalogue.test.js` | **7 pass / 0 fail** |
| `git diff --check` | **clean** (exit 0) |

No runtime files modified by this audit.

---

## 16. Suggested documentation commit message

```text
Document V5 max_branches enforcement gaps across create, activate, and downgrade.
```
