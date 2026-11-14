# CI execution mapping

| Check | Evidence |
|---|---|
| Stage A command | `package.json` `test:v13:ac` runs five files: `d16-ac-v213-contract`, `d19-qa-implementation`, `d14c-otp-auth`, `d17-ac-behavior`, `d19-synthetic-fixtures` |
| Stage A and non-mutating Stage D | Both jobs run that same command. A non-zero exit fails the job |
| D64–D77 tests | Not named by Stage A |
| Stage B, Stage C, authenticated Stage D | `if: ${{ false }}`. There are three held jobs. A held job cannot fail the workflow |
| `enable_db_stages` | Present as an input. It is not a job condition |
| Triggers | `workflow_dispatch` only. No top-level `push`, `pull_request`, or `schedule` |
| Write flags | Workflow env sets both write flags to `"0"` |
| SHA | `target_sha` is optional. Checkout uses `inputs.target_sha \|\| github.ref` |
| Artifacts | The workflow has no `upload-artifact` step. A run does not record SHA, environment, and run id as a build artifact |
| Release skip | `evaluateReleaseReadiness` treats a required row as failing unless `RESULT` is `PASS`. `NOT_RUN` blocks release |

Stage A executes tests. It does not execute the G1 list. The G2 and G3 gates stay held.
