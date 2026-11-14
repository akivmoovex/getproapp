# CI job mapping

`v13-ac-qa-regression.yml` is `workflow_dispatch` only. This stage did not dispatch it. `ci.yml` does not start on branch `V13`.

| Job | Condition | Command | What a failure does |
|---|---|---|---|
| `stage-a-static-unit` | Runs on dispatch | `npm run test:v13:ac` | Fails the job. There is no `continue-on-error` |
| `stage-d-nonmutating-security` | Runs after Stage A | The same `npm run test:v13:ac` | Fails the job. It does not add cases |
| `stage-b-integration` | `if: ${{ false }}` | Echo hold | Cannot fail. The job does not start |
| `stage-c-browser` | `if: ${{ false }}` | Echo hold | Cannot fail. The job does not start |
| `stage-d-security` | `if: ${{ false }}` | Echo hold | Cannot fail. Live AC-05 is not started |

`npm run test:v13:ac` is five files and 14 cases: `d16-ac-v213-contract`, `d19-qa-implementation`, `d14c-otp-auth`, `d17-ac-behavior`, and `d19-synthetic-fixtures`. None of the 84 acceptance IDs is in those files. Zero matrix rows have that command.

The local G1 command runs the unit and contract globs. Twenty-five matrix rows are in that command. G1 is not a CI job. Its last log is `/tmp/d53-g1.log`, 308 passed, and that pass is not acceptance.

The integration file for `APT-01-03` passes when `runGated` returns `NOT_RUN`. That is a green result, not a skipped result, so a report of passes hides the unrun body. The browser spec throws `NOT_RUN` instead, and its job never starts.

A failing assertion in `d32` through `d52` cannot fail Stage A, because Stage A does not run those files.
