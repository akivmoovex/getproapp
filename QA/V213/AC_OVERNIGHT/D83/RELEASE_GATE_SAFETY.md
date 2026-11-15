# Release gate safety

| Gate | State |
|---|---|
| G2 database jobs | Held by `if: ${{ false }}` and write flags `"0"` |
| G3 browser jobs | Held by `if: ${{ false }}` |
| G4 | No job exists |
| Deployment workflow | None. `ci.yml` does not list `V13` |
| `main` | Not modified |
| Schedule | Not added |
| Release | No |

The unapplied push patch does not remove those `if` conditions. Opening a pull request into `main` would start `ci.yml`, which is not Stage A, so that option was not used.
