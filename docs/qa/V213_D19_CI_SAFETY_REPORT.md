# V2.13 D19 CI safety

## Stage A

BlessBoard Stage A globs `tests/v13/contract/*.test.js` and `tests/v13/unit/*.test.js`, so the new fixture and discovery tests run there. ActiveClinic `npm run test:v13:ac` and platform `npm run test:v13:platform` now include those two files as well. Syntax checks cover the fixture module and the scenario runners. The local Stage A run passed 173 tests.

## Gates that remain

Stages B and C, and the live Stage D jobs, still have `if: ${{ false }}`. Workflow `env` keeps `GETPRO_V13_ALLOW_DB_WRITES=0` and `GETPRO_V13_DB_STAGES_AUTHORIZED=0`. Permissions stay `contents: read`. Triggers stay `workflow_dispatch`. There is no `push`, `pull_request`, or `schedule` key.

The database guard still allows only `127.0.0.1`, `localhost`, and `::1`, and only names matching `getpro_v13_(ci|bb_qa|int|e2e)_*`. Playwright still maps `*.local.test` to `127.0.0.1`.

## Push and deploy

`.github/workflows/ci.yml` runs on `main`, `v2`, and `V7` only. It does not list `V13`. The eight workflow files in this tree include no deploy workflow. Pushing `V13` does not start those jobs and does not deploy.

Browser traces can still retain cookies if Stage C is later enabled. The committed Playwright config still has a local default admin password. Replace that value before enabling Stage C. This task does not enable it.

## Secret handling

The new fixture password is synthetic. The testing OTP `1234` appears only inside the gated OTP runner, as the existing testing-policy input. Production activation with an `ACTIVE` override stays `BLOCKED`.
