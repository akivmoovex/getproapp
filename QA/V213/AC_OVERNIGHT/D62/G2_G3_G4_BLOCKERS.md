# G2, G3, and G4 blockers

| Gate | State | Blocker |
|---|---|---|
| G2 | Not run | Both write flags are `0`. No run-owned database. Stage B cannot start. 84 persistence cases have no stored result. Capacity is unapproved |
| G3 | Not run | Browser flag is `0`. The seven journeys throw `NOT_RUN` in `hold()`. Stage C cannot start |
| G4 | Not run | No release job. SHA, run id, and testing identity were not recorded for an acceptance run. Eighteen design decisions are pending |
| AC-05 | Not run | Live 403 for the lower-privilege session was not opened. `SEC-01-02` stays blocked |

Skipped and not-run work is the held jobs, the integration files that return `NOT_RUN`, and the browser spec that throws. G1 itself skipped 0. A green G1 does not close these gates.
