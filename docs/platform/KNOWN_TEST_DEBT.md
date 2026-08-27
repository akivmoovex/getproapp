# Known automated test debt

Failures recorded here predate the V7 shared website engine work and are
**unrelated** to it. They are tracked so regression counts stay meaningful:
anything failing that is not in this document is a regression.

Measured on branch `V7`, testing environment, DB identity `moovex-platform-v7`.

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
| `tests/blessboard-v5-a11y-structure.test.js` | 40 | Stitch visual/heading parity and auth-landmark assertions across HQ, branch and platform-admin templates | No |
| `tests/blessboard-website-mode-admin-nav.test.js` | 3 | `websiteModeAdminNav` pure navigation-label expectations for single-site/multi-site HQ and branch admins | No |
| `tests/blessboard-demo-v5-dataset.test.js` | 2 | `demo:v5` minimum dataset tool CLI dry-run/apply expectations | No |

Total in isolation: **45**.

## Cross-suite interference (not additional debt)

When the suites above run in one `node --test` invocation together with the
website/CMS suites, four further subtests fail because the suites share a single
foundation database and reset it independently:

- `blessboard church website preview and publish` — 2 subtests
- `ActiveClinic website hardening` — 1 subtest
- `Branch Admin edits only the assigned branch` — 1 subtest

All four pass when their suite runs on its own, and all four fail identically on
a clean baseline tree. Combined-run total: **49**.

## Phase history

| Phase | Baseline failures | Failures with changes | Regressions |
|---|---|---|---|
| V7 shared website engine, Phase 2 | 6 (narrower suite set of 660 tests) | 6 | 0 |
| V7 shared website engine, Phase 3 | 49 combined / 45 isolated | 49 combined / 45 isolated | 0 |

The Phase 3 count is higher than Phase 2 because Phase 3 measured a broader
suite list that deliberately includes the a11y-structure, admin-nav and demo
dataset suites. The failing subtest names are byte-identical between the Phase 3
baseline and working-tree runs.
