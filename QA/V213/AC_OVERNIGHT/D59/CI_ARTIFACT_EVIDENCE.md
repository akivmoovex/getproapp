# CI artifact evidence

The ActiveClinic workflow uploads no artifact. It has no pin step and no `checkout_sha` output. Checkout is `ref: ${{ inputs.target_sha || github.ref }}`. If the dispatcher omits `target_sha`, the job uses the branch ref, which can move. A full SHA is not required.

The BlessBoard workflow does record `CHECKOUT_SHA` and uploads a Stage A artifact when the named files exist. `if-no-files-found: ignore` means a missing report does not fail that upload. Those steps are not in the ActiveClinic workflow, and this stage did not run them.

Nothing in the ActiveClinic log path records a run id, the tested SHA, or a database identity, because the workflow does not write that record and it was not dispatched.
