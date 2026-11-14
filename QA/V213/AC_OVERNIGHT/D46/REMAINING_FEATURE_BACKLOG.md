# Remaining feature backlog

Ranked by release impact. The first group is still a defect or an evidence gap inside an existing contract. The second group is not approved to build.

## Still inside the current contract, not built here

| Item | Why it was left |
|---|---|
| AC-05 live denial | Needs a signed-in lower-privilege user. The route guards are already present |
| Portal and appointment persistence | Needs a disposable database. The in-process checks are already present |
| Two active alerts for one patient | Acknowledgement is patient-scoped. There is no result column, so the newest alert is still the one updated |
| Staff overlap race | The check is still outside the transaction. A lock needs D21-05 |
| Booking lookup token | A valid token stays readable so the receipt can be opened again |
| Registration error text | Distinct match errors were not collapsed. That copy change is not approved |
| Stock receipt lock | The inventory row is selected by facility, then locked by id. A miss path was not added in this stage |
| Facility key on a receipt number | `generateReceiptNumber` still reads `facilities` by id only |

## Not approved

Missing: merge and unmerge, retention and legal hold, backup and restore, offline writes, accessibility and monitoring.

Deferred: break-glass, Juflona signing.

Pending decisions: D21-01 through D21-15, D29-16, D29-17, and D29-18. Eighteen in total. The eight ACX rows stay outside the release.
