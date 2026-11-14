# Release gate summary

Release status is blocked.

| Gate | Evidence |
|---|---|
| G1 | In-process only. It is not one of the 84 passes |
| G2 | Not run. Stage B is `if: ${{ false }}` |
| G3 | Not run. Stage C is `if: ${{ false }}` |
| G4 | No release job |
| SHA, run id, testing identity | Not recorded for an acceptance run |
| Supplementary ACX | Not in the release |

`release_ready: true` is rejected unless all 84 cases qualify and G2, G3, and G4 are `PASS`. The honest current report keeps `release_ready` false.
