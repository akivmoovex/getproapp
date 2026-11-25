# V2.13.2 G147 — hosted version diagnosis

Read-only preflight. No deploy, restart, DNS change, secret change, or hosted database connection.

## Source

| Check | Result |
| --- | --- |
| Branch | `V13` |
| Local HEAD | `155ada725926d83468fe47e82b87757d20adb097` |
| `origin/V13` | Same SHA. No newer commit was on the remote at fetch |
| `main` | `44eafec486a18aeef2777bbcc9683e43f68ebe0d` |
| `origin/main` | `a802fc3fd503733767011798d3f90bf83058c7dd` |
| Product version | BlessBoard and ActiveClinic About templates are `2.13.2` |

## Public health observed this session

Both `https://blessboard.pronline.org/healthz` and `https://activeclinic.pronline.org/healthz` returned:

| Field | Value |
| --- | --- |
| `ok` | true |
| `gitSha` | `155ada725926` |
| `branch` | `V11` |
| `branchSource` | `GETPRO_GIT_BRANCH` |
| `displayLabel` | `V11 testing` |
| `deploymentCode` | `moovex-platform-testing` |
| `environment` | `testing` |
| `platformLine` | `v8` |
| `expectedIdentityKey` | `moovex-platform-v7` |
| `expectedDatabaseEnvironment` | `testing` |
| `sessionCookieName` | `moovex_platform_testing_sid` |
| `schemaCompatible` | true |
| `jobsEnabled` | false |

This session did not deploy that SHA. G146 had observed `a8e6e688b084` on the same URLs. The checkout moved between these preflights. The branch label did not.

## Why the label says V11

The label is not hardcoded. `getBuildIdentity` in `src/platform/runtime/buildIdentity.js` uses this order:

1. Live `process.env.GETPRO_GIT_BRANCH`.
2. Other branch env keys (`GIT_BRANCH`, `GITHUB_REF_NAME`, `HOSTINGER_GIT_BRANCH`, `DEPLOYMENT_BRANCH`).
3. `.getpro/build-identity.json` for sibling hostname workers.
4. An attached git HEAD.
5. `UNKNOWN`.

`/healthz` prints that branch, `branchSource`, and the git SHA from `GETPRO_GIT_SHA` or the checkout. Hostinger gives `GETPRO_GIT_BRANCH` to the apex Node app only. A panel value is not visible until the worker restarts.

The hosted SHA prefix matches the V13 commit `155ada72`, while `GETPRO_GIT_BRANCH` is still `V11`. The application reports both facts. It does not rewrite the env label to `V13`, and it does not rewrite the SHA to match the label. `tests/v13/unit/g147-build-identity.test.js` locks that split. The database-free suite after that test executed 572, passed 570, failed 0, and skipped 2. HTTP and Playwright were not re-run. Their last authorized pair remains the G146 result.

## What pins the commit

GitHub Actions does not deploy this candidate. `.github/workflows/ci.yml` listens to `main`, `v2`, and `V7` only. The V13 regression workflows are `workflow_dispatch`, and their database stages stay `if: false`. The hosted SHA is whatever the Hostinger checkout and worker start are running. `package.json` starts the app with `node index.js`.

## Schema compatibility limit

`schemaCompatible=true` means the V7 required checks passed: website tables, registration lifecycle, website RBAC, provision-stage and terms columns, ActiveClinic core tables, `website_published`, and `public_website_visible`. It does not prove `platform.otp_challenges`, ActiveClinic migrations `043` and `044`, or a Resend setting. Those checks are absent from the health payload.
