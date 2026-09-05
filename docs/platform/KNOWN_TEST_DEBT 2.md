# Known automated test debt

Failures recorded here predate the V7 shared website engine work and are
**unrelated** to it. They are tracked so regression counts stay meaningful:
anything failing that is not in this document is a regression.

Measured on branch `V7`, testing environment, DB identity `moovex-platform-v7`.

> **Triaged.** Every failing assertion below is classified for V1 relevance in
> [`V1_TEST_DEBT_TRIAGE.md`](./V1_TEST_DEBT_TRIAGE.md). That pass corrected this
> baseline in three ways: the isolated total is **46**, not 45 (two suites that
> fail in isolation were recorded only as interference); the two `demo:v5`
> failures are a leaked `PLATFORM_DEPLOYMENT_CODE` shell variable rather than
> product debt; and 34 of the 40 a11y failures were stale CSS cache-buster pins,
> now fixed. **12** assertions remain, of which one root cause is a real product
> bug (branch-scoped authorization uses the catalogue primary branch instead of
> the actor's assigned branch).

## How the baseline is established

Each phase re-measures by stashing the phase's changes and running the identical
suite list twice (clean tree, then working tree). A change is a regression only
if the set of failing subtest names grows.

```
git stash push -m baseline
node --test --test-concurrency=1 <suite list>   # baseline
git stash pop
node --test --test-concurrency=1 <suite list>   # with changes
```

## Debt inventory

Counts are from running each suite **in isolation**.

| Suite | Failing subtests | Nature | Related to website engine |
|---|---|---|---|
| `tests/blessboard-v5-a11y-structure.test.js` | 40 → **4** | Was mostly pinned CSS cache-buster numbers, not accessibility; pins fixed. Auth-label and `Support` assertions since corrected. Remainder is renamed platform-admin deployment paths (POST_V1) | No |
| `tests/blessboard-website-mode-admin-nav.test.js` | 3 → **0** | 2 were the HQ onboarding redirect (fixture completed); 1 was the real branch-authorization bug (fixed) | No |
| `tests/blessboard-demo-v5-dataset.test.js` | 2 → **0** | Leaked `PLATFORM_DEPLOYMENT_CODE`; the suite no longer inherits it | No |
| `tests/blessboard-branch-mini-website-pages.test.js` | 1 → **0** | Real branch-authorization bug (fixed) | No |
| `tests/blessboard-branch-service-times.test.js` | 2 → **0** | 1 real branch-authorization bug (fixed), 1 stale empty-state sentinel (corrected) | No |

Total in isolation: **46** as originally measured, **12** after the stale
cache-buster pins were fixed, and **4** after the Overnight 5 fix pass. The
remaining 4 are the POST_V1 platform-admin deployment path literals.

See `docs/platform/V1_TEST_DEBT_TRIAGE.md` for the per-assertion classification
and what the fix pass changed.

## Cross-suite interference (not additional debt)

When the suites above run in one `node --test` invocation together with the
website/CMS suites, four further subtests fail because the suites share a single
foundation database and reset it independently:

- `blessboard church website preview and publish` — 2 subtests
- `ActiveClinic website hardening` — 1 subtest
- `blessboard website scope resolver` — 1 subtest

Each passes when its suite runs on its own, and each fails identically on a
clean baseline tree. Combined-run total after the Overnight 5 fixes: **47**
(baseline at the parent commit: 53, with 0 new failures introduced).

Making combined runs a usable regression gate requires per-suite database
isolation, which is tracked as post-V1 work in the triage document.

## Phase history

| Phase | Baseline failures | Failures with changes | Regressions |
|---|---|---|---|
| V7 shared website engine, Phase 2 | 6 (narrower suite set of 660 tests) | 6 | 0 |
| V7 shared website engine, Phase 3 | 49 combined / 45 isolated | 49 combined / 45 isolated | 0 |
| V1 test debt triage (Overnight 4) | 46 isolated (re-measured) | 12 isolated | 0 |
| V1 relevant failure fixes (Overnight 5) | 53 combined / 12 isolated | 47 combined / 4 isolated | 0 |
| Full V1 website regression (Overnight 7) | 71 (230-suite set at `dea5e0f2`) | 28 | 0 |

The Overnight 7 pass measured a 230-suite website/CMS/auth/a11y selection against
a pre-overnight baseline worktree at `dea5e0f2`: failures fell 71 → 28 with **0
regressions and 43 assertions newly passing**. The narrower 72-suite *V1 website
core* set is **726/726 with no skips**. Remaining failures are stale CSS/copy
pins, platform-admin Stitch literals, one legacy V4 CSRF view, and suites that
need a provisioned local database or a real browser — see
`docs/platform/V1_WEBSITE_MORNING_QA_PACK.md`.

The Phase 3 count is higher than Phase 2 because Phase 3 measured a broader
suite list that deliberately includes the a11y-structure, admin-nav and demo
dataset suites. The failing subtest names are byte-identical between the Phase 3
baseline and working-tree runs.
