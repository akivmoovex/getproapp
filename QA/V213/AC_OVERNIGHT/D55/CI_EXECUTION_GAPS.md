# CI execution gaps

`v13-ac-qa-regression.yml` is `workflow_dispatch` only. It has no `push`, `pull_request`, or `schedule`. This stage did not dispatch it.

| Job | When it runs | What it executes |
|---|---|---|
| Stage A | On dispatch | Syntax checks, then `npm run test:v13:ac` (14 cases) |
| Stage D, non-mutating | On dispatch, after Stage A | The same 14 cases again |
| Stage B integration | `if: ${{ false }}` | `echo` that the database is not authorized |
| Stage C browser | `if: ${{ false }}` | `echo` that the browser is not authorized |
| Stage D authenticated | `if: ${{ false }}` | `echo` that live AC-05 is not authorized |

The workflow file lists the integration and Playwright commands in comments and in the held jobs. Those jobs cannot run while `if` is false. Discovering a test path in the YAML is not an execution.

The same hold is in `v13-bb-qa-regression.yml`, `v13-bb-bug-regressions.yml`, and `v13-platform-qa-regression.yml`: integration and Playwright jobs are `if: ${{ false }}`. `ci.yml` does not trigger on branch `V13`.

No test in `tests/v13` catches a missing dependency and continues as a pass. The integration hold is explicit. The browser hold throws. Neither is a silent skip. The false green is the integration test that completes after `runGated` returns `NOT_RUN`.
