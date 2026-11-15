# CI retry procedure

The YAML quote is applied locally and is not committed. Do not dispatch from this stage.

A push of the two workflow files to `V13` will not start Stage A. Both files still trigger only on `workflow_dispatch`, and D18, D19, and D67 require that absence of a `push` trigger. `workflow_dispatch` will not register from `V13` alone because the default branch is `main`. This stage does not change `main`.

The retry is not ready. The next approval is a choice that was not made here:

1. Add `push` limited to branch `V13` on the two repaired workflows, and update the D18, D19, and D67 assertions that currently forbid every `push` key. Stage A and the non-mutating Stage D would then start on that push. The jobs with `if: ${{ false }}` would not run. No deploy workflow is in the tree.
2. Place the same two files on `main` so `workflow_dispatch` can be called with `ref` `V13`. That changes the default branch and was not done.

Until one of those is approved, do not describe a GitHub event as starting Stage A.
