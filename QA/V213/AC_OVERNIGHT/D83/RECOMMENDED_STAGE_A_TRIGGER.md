# Recommended Stage A trigger

Option B is the least invasive way to run Stage A. It stays on `V13`, does not change `main`, and does not remove `if: ${{ false }}` from the database, browser, or authenticated-session jobs.

It is not applied. The current D19 test is named so that a `V13` push does not start CI, and both Stage A commands run that test. The workflow files also fail their own step when a `push` key is present. Turning the trigger on without an approved edit to those three checks would make Stage A fail after it starts.

Approval has to cover four points:

1. Add `push` with `branches: [V13]` to the ActiveClinic and platform workflows only.
2. Keep `pull_request` and `schedule` absent.
3. Replace the blanket `push` prohibition with a check that the only branch listed under `push` is `V13`.
4. Leave the BlessBoard workflows dispatch-only.

Until that approval, the worktree keeps `workflow_dispatch` as the only trigger.
