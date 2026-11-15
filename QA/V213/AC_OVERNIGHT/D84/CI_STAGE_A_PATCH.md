# Stage A patch

This patch is not applied. The worktree still has only the six quoted `echo` commands.

After approval, the ActiveClinic and platform workflows change as follows. The BlessBoard workflows stay dispatch-only.

```yaml
on:
  push:
    branches: [V13]
  workflow_dispatch:
```

Checkout uses `ref: ${{ inputs.target_sha || github.sha }}`. On a push, `github.sha` is the commit that started the run.

The self-check at line 54 of the ActiveClinic file and line 55 of the platform file currently runs `! grep -E '^\s+push:'`. The approved replacement keeps one `push` key and rejects every other shape:

```bash
test "$(grep -c '^\s*push:' "$file")" = 1
grep -q 'branches: \[V13\]' "$file"
! grep -E 'branches:.*main' "$file"
! grep -E '^\s+pull_request:' "$file"
! grep -E '^\s+schedule:' "$file"
```

`stage-d-nonmutating-security` gains `if: "${{ github.event_name == 'workflow_dispatch' }}"`, so a push does not run it. The three jobs that already have `if: ${{ false }}` stay that way. A push therefore starts only `stage-a-static-unit`.

After `npm run test:v13:ac` or `npm run test:v13:platform`, a later step with `if: always()` writes `sha.txt`, `run-id.txt`, and `ref.txt` under `test-results/` and uploads that directory. The test step has no `continue-on-error`. `npm run` exits nonzero when the script is missing or a test fails, and that failure remains the job result.

The same approval updates the hold assertions listed in `TRIGGER_SAFETY_REVIEW.md`. It does not delete them.
