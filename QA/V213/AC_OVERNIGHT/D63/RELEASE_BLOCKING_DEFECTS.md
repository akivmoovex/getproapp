# Release-blocking defects

No new product defect was found that an already approved contract allows this stage to change. The organization and status checks from D46 through D51 are in the worktree and are not a new backlog item.

What still blocks a release is missing evidence:

| Blocker | Why it is not a code change yet |
|---|---|
| `SEC-01-02` | The route guard exists. A signed-in lower-privilege 403 was not recorded |
| Portal activation | The organization check exists. No identity row was stored |
| Appointment collision | `runAcAuth` exists and was not run. Capacity is a separate unapproved rule |
| Payment duplicate | The tenant-scoped check exists. The behavioral test never reaches it |
| G2, G3, G4 | The jobs do not start. No SHA, run id, or testing identity was recorded |

A green G1 of 321 passes does not close any of these. The D61 validator rejects a report that marks them passed.
