# Activation approval

The V13-only push trigger is not approved and is not in the workflow files.

Activation requires a later explicit approval of the patch in `CI_STAGE_A_PATCH.md` and the narrowed assertions in `TRIGGER_SAFETY_REVIEW.md`. After that approval, the sequence is one commit on `V13` containing only the two workflow files and the three hold tests, then a push to `origin/V13`. That push is what would start the two Stage A jobs. Dispatch is not required.

This stage does not perform that commit, push, or dispatch. `main` is not changed. Database, browser, migration, deployment, and schedule jobs stay disabled.
