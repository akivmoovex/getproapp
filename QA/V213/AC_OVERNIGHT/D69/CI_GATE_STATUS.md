# CI gate status

Stage A remains narrow. `.github/workflows/v13-ac-qa-regression.yml` was not edited and was not dispatched.

| Check | State |
|---|---|
| `npm run test:v13:ac` | 5 files, 14 passed, 0 failed, 0 skipped |
| Integration or Playwright in that command | No |
| Stage B, Stage C, authenticated Stage D | `if: ${{ false }}` (3) |
| `schedule` trigger | Absent |
| Write flags in the workflow | `0` |
| `enable_db_stages` used as a job condition | No |
| SHA required | No. Checkout still allows `github.ref` |
| ActiveClinic artifact upload | Absent |

G2 and G3 stay `NOT_RUN`. A green Stage A run of 14 cases would not certify the 84 acceptance IDs.
