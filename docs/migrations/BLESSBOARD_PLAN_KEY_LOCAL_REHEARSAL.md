# BlessBoard plan_key local rehearsal

**Date:** 2026-07-19  
**Mode:** Gate check only — **no disposable DB rehearsal executed**  
**Companion:** [`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](./BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md)

**Hard rule for this task:** Rehearse only if the plan has a **READY TO IMPLEMENT** verdict **and** a migration implementation exists. Do not use hosted databases.

---

## Gate result

| Gate | Required | Actual | Pass? |
|------|----------|--------|-------|
| Plan verdict | `READY TO IMPLEMENT` | **NOT READY TO IMPLEMENT** (`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md` status + §28) | **NO** |
| Migration exists | SQL/tooling that inserts `foundation`/`network`, repoints `organization_subscriptions.plan_id`, updates seeds/provision/mapPlanKey | **None found** — only analysis doc + current seeds still use `free` / `growth` / `professional` / `partner` | **NO** |
| Mapping ambiguities closed | Signed G1–G6 (partner remap, feature parity, provision default cutover, etc.) | Plan §27: **No signed G1–G6 ⇒ NOT READY** | **NO** |

### Verdict for task 68

**BLOCKED — STOPPED BEFORE APPLY**

No seed / dry-run / apply / verify / second-apply / rollback rehearsal was run against any database (disposable or hosted).

---

## Why rehearsal must not proceed

1. **Immutable `plan_key`:** Rename requires insert-new-plan + FK repoint; no such migration script exists in `db/migrations/` or `db/scripts/`.  
2. **Partner handling still gated:** Auto-map `partner` → `network` is explicitly **not** automatic in the plan.  
3. **Legacy keys still live:** `db/seeds/003_blessboard_plans.sql` and provision default `planKey: "free"` remain on the old vocabulary.  
4. **V4→V5 `mapPlanKey`** still emits `free` / `professional` / `partner` (not `foundation` / `network`).  
5. Inventing a local rehearsal migration here would violate the plan constraint and the task’s “run only if READY + migration exists” rule.

---

## Stage table (not executed)

| Stage | Command / action | Result | Evidence |
|-------|------------------|--------|----------|
| 0. Readiness gate | Check plan verdict + migration presence | **BLOCKED** | Plan header + §28; no plan_key migration files |
| 1. Seed legacy plan keys | — | **SKIPPED** | Gate failed |
| 2. Seed subscriptions | — | **SKIPPED** | Gate failed |
| 3. Seed entitlement refs | — | **SKIPPED** | Gate failed |
| 4. Dry run | — | **SKIPPED** | Gate failed |
| 5. Apply | — | **NOT RUN** | Stopped before apply by policy |
| 6. Verify Foundation/Growth/Network | — | **SKIPPED** | Gate failed |
| 7. Second apply | — | **SKIPPED** | Gate failed |
| 8. Rollback rehearsal | — | **SKIPPED** | Gate failed |

---

## Expected mapping (from plan — not rehearsed)

| Legacy `plan_key` | Target | Automatic? |
|-------------------|--------|------------|
| `free` | `foundation` | Yes after feature parity + approvals |
| `growth` | `growth` | Identity — leave unchanged |
| `professional` | `network` | Yes after feature parity + approvals |
| `partner` | `network` (candidate) | **No — gated** |

Public package names (`Foundation` / `Growth` / `Network`) already exist in the church package catalogue via aliases; platform persisted keys have **not** been migrated.

---

## Report fields (task 68)

| # | Item | Result |
|---|------|--------|
| 1 | Test records | **None created** |
| 2 | Migration result | **N/A — blocked** |
| 3 | Subscription mapping | **N/A — blocked** |
| 4 | Entitlement mapping | **N/A — blocked** |
| 5 | Second-run result | **N/A — blocked** |
| 6 | Rollback result | **N/A — blocked** |
| 7 | Readiness verdict | **NOT READY** for local plan_key rehearsal or hosted apply |
| 8 | Next step | Close G1–G6 in the migration plan, implement insert+repoint migration + tests, flip verdict to READY TO IMPLEMENT, then re-run this rehearsal on disposable foundation DB only |

---

## Suggested commit message

```
docs(migrations): record plan_key rehearsal blocked (not ready)

Gate check only: plan remains NOT READY TO IMPLEMENT and no plan_key
migration tooling exists; no disposable DB apply was run.
```
