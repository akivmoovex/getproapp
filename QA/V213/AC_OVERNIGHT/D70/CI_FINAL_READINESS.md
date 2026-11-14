# CI final readiness

| Gate | State | Evidence |
|---|---|---|
| Stage A | `NARROW` | Five files, 14 passed, 0 failed, 0 skipped |
| Failure propagation | Visible when the command runs | A forced `node --test` failure exits 1. A skip is counted as skipped |
| G2 | `HELD` | Stage B is `if: ${{ false }}`. Not dispatched |
| G3 | `HELD` | Stage C is `if: ${{ false }}`. Not dispatched |
| G4 | `ABSENT` | No V13 workflow contains a G4 job |

`enable_db_stages` does not start a job. Both write flags in the ActiveClinic workflow are `0`. The checkout SHA is optional. There is no ActiveClinic artifact upload. A green Stage A run does not certify the 84 acceptance IDs.

Release stays no. G2, G3, and G4 evidence is absent.
