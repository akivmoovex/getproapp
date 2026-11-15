# CI validation

Stage A is `npm run test:v13:ac`, which is `node --test` on five files. The ActiveClinic and platform workflows are `workflow_dispatch` only. Held jobs stay `if: ${{ false }}`. Both write flags in the workflow are `"0"`. Checkout uses `inputs.target_sha || github.ref`, so the SHA is optional and is not pinned.

The ActiveClinic and platform workflows have no artifact upload. The BlessBoard workflows declare artifact steps, and those workflows were not run. `ci.yml` triggers on `main`, `v2`, and `V7`. It does not list `V13`, and these QA workflows do not deploy.

The local quote fix still parses. The V13 push trigger was not added. No workflow was dispatched.
