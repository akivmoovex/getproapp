# CI security gates

| Gate | ActiveClinic workflow |
|---|---|
| G2 database | Held. `if: ${{ false }}`. Workflow env sets both write flags to `0`. No `DATABASE_URL` |
| G3 browser | Held. `if: ${{ false }}`. No `E2E_DATABASE_URL` |
| G4 release | No job exists |
| Migration | The file contains no migrate command |
| Deployment | The file contains no deploy, fly, or ssh step |
| Production URL | Stage A does not select a database. The held jobs do not start, so they cannot select one either |
| Network | No deny-list or offline mode. `npm ci` uses the runner network. That is not isolation |
| Secrets | `permissions: contents: read`. No `secrets` context and no secret echo. The file was not changed |

`enable_db_stages` does not open these gates. The comment says it must remain false. The job condition does not read the input, so the hold does not depend on the person who clicks dispatch.

`ci.yml` does not start on branch `V13`. The V12 browser workflows are also `workflow_dispatch` only. They point at `127.0.0.1` database names and are not the V13 gate.
