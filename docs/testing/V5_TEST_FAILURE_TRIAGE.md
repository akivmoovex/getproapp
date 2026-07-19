# BlessBoard V5 — Test failure triage

**Date:** 2026-07-19  
**Inputs:** [`BLESSBOARD_V5_OVERNIGHT_HANDOVER.md`](../handover/BLESSBOARD_V5_OVERNIGHT_HANDOVER.md) · [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) · [`V5_TEST_COMMAND_CATALOGUE.md`](./V5_TEST_COMMAND_CATALOGUE.md)  
**Fast gate:** `npm run test:blessboard:v5:regression:fast`

---

## Summary

| Gate | Result |
|------|--------|
| Fast V5 regression (handover-time + this triage) | **PASS** — 170 / 0 |
| Documented “failures” in handover / blockers | Mostly **ops/data gates**, not failing unit tests |
| Reproduced automated failure | Shared foundation DB **DROP/CREATE race** under concurrent `node --test` |
| Safe fix applied | Unique ephemeral DB names per `resetFoundationDatabase()` |

---

## Assessed items

| Test | Area | Failure type | New or pre-existing | Root cause | Safe fix | Blocker level |
|------|------|--------------|---------------------|------------|----------|---------------|
| `blessboard catalogue http context — live lookup write check` / `middleware performs no writes…` | Catalogue HTTP | **TEST ENVIRONMENT** (race) | Pre-existing helper design; surfaced overnight | All suites shared `blessboard_foundation_test`; concurrent `resetFoundationDatabase()` DROP/CREATE terminated peers (`terminating connection…`, `duplicate key … pg_database_datname_index`) | Allocate unique `blessboard_ft_<pid>_<ts>_<hex>` DB per reset; serialize admin ops; best-effort cleanup | **None** after fix (local CI concurrency) |
| `blessboard catalogue lookup` (all cases) under concurrency | Catalogue lookup | **TEST ENVIRONMENT** (race) | Same | Same shared-DB race | Same foundation helper fix | **None** after fix |
| Fast regression (`precommit-fast`) | Static V5 gate | — | — | No failures recorded or reproduced | N/A | None |
| Full V5 regression (catalogue §14) | Foundation DB suites | — | Earlier overnight **PASS** | N/A when run sequentially via npm runner | Keep runner sequential at suite level | None |
| Hosted demo E2E / authoritative smoke | Demo / routing | **MISSING FIXTURE** (hosted data) + not run | Pre-existing | No personas / Home / About / samples; mode not authoritative | Ops provision + smoke — **not** a unit-test fix | CRITICAL for DEMO / AUTHORITATIVE (release B02–B05) — **not** a green-bar unit failure |
| Live shadow evidence pack | Routing | **MISSING FIXTURE** (ops evidence) | Pre-existing | Shadow not enabled; evidence not captured | Manual runbook only | CRITICAL for AUTHORITATIVE (B01) |
| `lint:css --max-warnings 0` | CSS lint | **V4-ONLY DEBT** / repo-wide | Pre-existing | `color-no-hex` warnings across `public/**/*.css` | Do not use as V5 gate (catalogue §1) | LOW / INFORMATIONAL |
| npm audit multer / path-to-regexp | Dependencies | **V4-ONLY DEBT** / shared | Pre-existing | Dependency advisories | Triage before production (M10) | MEDIUM for PRODUCTION CUTOVER — not a test fail |
| Local Postgres completely absent | Any `foundationDb` suite | **TEST ENVIRONMENT** | Pre-existing | Suites `assert.fail` when setup cannot connect | Install/start local Postgres or accept fail-loud (no skip added) | None for hosted; local developer env |
| Apex “One digital home…” contiguous string | Foundation startup | **STALE ASSERTION** | Fixed earlier overnight | Headline split across `<span>` | Regex `[\s\S]*` already applied in `v5-foundation-startup.test.js` | None |
| Intentional product omissions (prayer route, payments, etc.) | Product | **INTENTIONAL SKIP** (product scope) | By design | No test expected to assert those features | Keep deferred | POST-CUTOVER |

### Classification key

| Type | Meaning |
|------|---------|
| REAL DEFECT | Product/runtime bug |
| STALE ASSERTION | Test out of date vs intentional UI/API |
| TEST ENVIRONMENT | Local Postgres / concurrency / tooling |
| MISSING FIXTURE | Hosted demo data or ops evidence absent |
| INTENTIONAL SKIP | Documented out-of-scope |
| V4-ONLY DEBT | Legacy / repo-wide, not V5 foundation gate |
| UNKNOWN | Insufficient evidence |

---

## Fixes applied this triage

| Change | Why allowed |
|--------|-------------|
| `tests/helpers/foundationDb.js` — unique DB per reset + admin chain + cleanup | V5 test helper only; no schema/hosted/prod change; preserves suite behavior; removes false failures under concurrency |

**Not done (policy):** converting `assert.fail` → `t.skip` for missing Postgres; deleting tests; loosening product assertions; V4-only lint debt.

---

## Verification

```text
node --test --test-concurrency=4 \
  tests/blessboard-catalogue-http-context.test.js \
  tests/blessboard-catalogue-lookup.test.js \
  tests/v5-foundation-startup.test.js
→ # pass 45 # fail 0

npm run test:blessboard:v5:regression:fast
→ BlessBoard V5 regression PASSED (fast) — 170 pass / 0 fail
```

---

## Remaining

| Item | Status |
|------|--------|
| Automated V5 fast gate failures | **None** |
| Hosted demo / shadow / authoritative / migration gates | Still blocked per release doc — **ops**, not unit tests |
| Orphaned local DBs `blessboard_ft_*` after crash | Best-effort `beforeExit` cleanup; manual `DROP DATABASE` if needed |
| Fixed `FOUNDATION_DATABASE_URL` + concurrency | Still unsafe by design — use `--test-concurrency=1` or leave unset |

---

## Related commands

| Command | Role |
|---------|------|
| `npm run test:blessboard:v5:regression:fast` | Morning static gate |
| `npm run test:blessboard:v5:regression` | Full local foundation (sequential npm suites) |
| Catalogue | [`V5_TEST_COMMAND_CATALOGUE.md`](./V5_TEST_COMMAND_CATALOGUE.md) |
