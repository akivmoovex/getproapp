# G2 and G3 readiness

Neither gate was opened. Both write flags and the browser flag stayed `0`.

| Check | Ready to run | Still required |
|---|---|---|
| AC-05 live denial | The route guards are present | A signed-in user without `platform_administrator`, and proof the database did not change |
| Portal activation | The organization check is in the service | A disposable database and a stored identity count |
| Staff overlap | The check exists outside the transaction | A disposable database. Capacity stays `BLOCKED_APPROVAL_REQUIRED` |
| Critical acknowledgement | The alert follows the result’s patient | A disposable database. No escalation timer |
| Payment retry | The key is tenant-scoped | A disposable database. No live payment |
| Document isolation | Joins require the same organization | A disposable database |
| Browser conflict and accessibility | Cases are written down | A browser session. Not opened |

Do not treat a mocked miss, a gated file, or this G1 log as a G2 or G3 pass.
