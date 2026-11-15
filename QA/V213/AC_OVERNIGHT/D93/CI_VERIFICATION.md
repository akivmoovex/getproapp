# CI verification

`npm run test:v13:ac` is a `node --test` command. A failing assertion in that command exits nonzero, which fails the Stage A job when GitHub actually runs it. GitHub has not run it. Runs `43654736449` and `43654737245` failed before creating a job. The quote fix is local. The V13-only push trigger is not approved and is not in the files.

Stage B, Stage C, and authenticated Stage D stay `if: ${{ false }}`. Both write flags in the workflow are `"0"`. No QA workflow deploys. `ci.yml` does not list `V13`. No artifact was uploaded, so no artifact records the SHA. The local log `/tmp/d93-g1.log` is not a GitHub artifact.

G2 and G3 were not started. Their flags are `0` and no database URL is set.
