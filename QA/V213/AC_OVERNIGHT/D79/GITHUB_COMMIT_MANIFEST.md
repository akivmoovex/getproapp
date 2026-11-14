# Git commit manifest

This manifest was not executed. The index is empty. HEAD is `b8f6b420d25e908de64ba292866c218c32edc30c`.

| Set | Count | Notes |
|---|---|---|
| Tracked modifications | 69 | 47 under `src`, 5 under `tests`, none under `db/migrations`, none under `.github/workflows` |
| Untracked tests | 115 | Includes the D64–D77 unit and contract files and the 13 integration files |
| Untracked QA | 397 | Reports under `QA/V213`. QA is not gitignored |
| Untracked product files | `documentScope.js`, `appointmentSchedulingRules.js` | Used by the document and capacity checks |
| Untracked `.env` | 0 | |

Do not `git add -A`. Do not commit `.env`, a connection string, or a credential file. A QA-only commit cannot load the application. The four V13 workflows were not modified and must not be edited to enable a gate.

No commit, push, or deployment was made.
