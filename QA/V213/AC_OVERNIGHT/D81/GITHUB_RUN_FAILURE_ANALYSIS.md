# GitHub run failure analysis

Both runs are for commit `c2cd146b01c6a9cfd92db65c2862320892c0888c` on `V13`. Each has conclusion `failure`, zero jobs, and no log. The Actions page annotation is the validation error.

| Run | Workflow path | Event | Annotation |
|---|---|---|---|
| `43654736449` | `.github/workflows/v13-ac-qa-regression.yml` | `push` | `Invalid workflow file` at line 84: `You have an error in your yaml syntax on line 84` |
| `43654737245` | `.github/workflows/v13-platform-qa-regression.yml` | `push` | `Invalid workflow file` at line 85: `You have an error in your yaml syntax on line 85` |

GitHub stored the workflow name as the file path. Actions are enabled and all actions are allowed. `sha_pinning_required` is false. The token can read the repository and workflows. No reusable workflow is referenced. No secret is read by either file.

The BlessBoard workflows were not in this failure set. Ruby parses both of those files. They have no `push` trigger, so a push does not start them.
