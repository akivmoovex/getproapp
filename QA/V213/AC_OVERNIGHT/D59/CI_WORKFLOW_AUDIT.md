# CI workflow audit

ActiveClinic’s own workflow is `.github/workflows/v13-ac-qa-regression.yml`. It is `workflow_dispatch` only. `ci.yml` runs on `main`, `v2`, and `V7`, not on `V13`. This stage did not dispatch anything.

| Job | Condition | Command |
|---|---|---|
| Stage A | Runs on dispatch | Syntax checks, then `npm run test:v13:ac` |
| Stage D, non-mutating | After Stage A | The same `npm run test:v13:ac` |
| Stage B integration | `if: ${{ false }}` | Echo hold |
| Stage C browser | `if: ${{ false }}` | Echo hold |
| Stage D authenticated | `if: ${{ false }}` | Echo hold |

`npm run test:v13:ac` is five files: `d16-ac-v213-contract`, `d19-qa-implementation`, `d14c-otp-auth`, `d17-ac-behavior`, and `d19-synthetic-fixtures`. That is 14 cases. The unit and contract files from D22 through D58, including `d22-ac05-admin-denial.test.js` and `d57-behavioral-strengthening.test.js`, are not in that command.

Stage A therefore does not execute the ActiveClinic unit suite, the contract suite, or the AC-05 security file. It executes one OTP unit file and two contract files. The BlessBoard workflow’s Stage A does run `tests/v13/unit/*.test.js` and `tests/v13/contract/*.test.js`, but that is not the ActiveClinic gate and it was not dispatched.

`inputs.enable_db_stages` is not referenced by any `if`. Setting it to true does not start Stage B or Stage C. There is no release job and no deploy step.
