# Workflow patch manifest

The quote correction is already in the worktree and is not committed. The trigger below is not in the worktree.

Applied locally, uncommitted:

- `.github/workflows/v13-ac-qa-regression.yml`: three `echo` commands are YAML-quoted
- `.github/workflows/v13-platform-qa-regression.yml`: three `echo` commands are YAML-quoted

Prepared and not applied, for both of those files after approval:

```yaml
on:
  push:
    branches: [V13]
  workflow_dispatch:
```

Checkout `ref` becomes `${{ inputs.target_sha || github.sha }}`. The self-check stops rejecting every `push` key and instead requires `branches: [V13]` while still rejecting `pull_request` and `schedule`. After `npm run test:v13:ac` or `npm run test:v13:platform`, an `if: always()` step writes `test-results/.../sha.txt` from `GITHUB_SHA` and uploads it. The test step does not use `continue-on-error`, so a failed test still fails the job. Held jobs stay `if: ${{ false }}`. Write flags stay `"0"`.

D18, D19, and D67 would need the same narrow allowance. That test edit is part of the approval and is not applied. No product source file is in the patch.
