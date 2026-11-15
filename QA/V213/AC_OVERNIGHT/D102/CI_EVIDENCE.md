# CI evidence

| Run | SHA | Jobs | Conclusion |
|---|---|---|---|
| `43654736449` | `c2cd146b01c6a9cfd92db65c2862320892c0888c` | 0 | failure |
| `43654737245` | `c2cd146b01c6a9cfd92db65c2862320892c0888c` | 0 | failure |

Both are push events. Neither created a job, so Stage A did not execute `npm run test:v13:ac`. No artifact was uploaded. The local quote fix is not on origin. The V13-only push trigger is not in the files. `ci.yml` does not list `V13`. No workflow was dispatched in D95 through D102.
