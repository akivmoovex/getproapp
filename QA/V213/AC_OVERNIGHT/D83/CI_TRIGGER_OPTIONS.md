# CI trigger options

HEAD and `origin/V13` are `c2cd146b01c6a9cfd92db65c2862320892c0888c`. The worktree quotes the six held-job `echo` commands and does not add a trigger. No reusable workflow caller exists. `ci.yml` listens to `main`, `v2`, and `V7` only.

| Option | Supported now | Changes `main` | Extra commit | Can deploy | G2/G3/G4 | Runs Stage A | SHA pin |
|---|---|---|---|---|---|---|---|
| A. Pull request from `V13` into `main` | The PR event exists on `ci.yml` only | No, if the PR is not merged | No | No deploy workflow. The PR would run `ci.yml`, including the component job's Postgres service when the base is `main` | Stay held in the V13 files. `ci.yml` is a different job | No. `ci.yml` does not run `test:v13:ac` or `test:v13:platform` | Not the V13 checkout input |
| B. `push` limited to branch `V13` on the two repaired workflows | Not present. D18, D19, D67, and each workflow's own `grep` forbid a `push` key | No | Yes, after approval | No workflow in this repo deploys. A previous push queued an external Netlify check that produced no deployment record | The three `if: ${{ false }}` jobs stay held. No G4 job exists | Yes, after the quoted file is what GitHub parses | `github.sha` is the pushed commit. `inputs.target_sha` remains available for dispatch |
| C. Register the workflows on `main` so `workflow_dispatch` works | Dispatch reads the default branch. These files are not on `main` | Yes | Yes, on `main` | A commit to `main` starts `ci.yml` | Stay held if the file contents are unchanged | Yes, once dispatch is called with `ref` `V13` | The existing `target_sha` input |
| D. Existing reusable workflow | No `workflow_call` trigger and no caller | No | A caller would be new | No | Unchanged | No caller reaches Stage A | Not applicable |

A does not run Stage A. C changes `main`. D has nothing to call. B is the only option that runs the Stage A commands without editing `main`. It is not activated.
