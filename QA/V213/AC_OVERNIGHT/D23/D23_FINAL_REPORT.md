# D23 final report

`V13` matches `origin/V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. `main` and `V12` are on their previously recorded tips. Neither V9 checkout was written.

The worktree has 60 product files and 122 QA candidates once these reports are included. The QA candidates include the five D22 harness edits, seven D22 reports, and the D20 and D21 documents. No unexpected secret, dump, or migration is in that inventory.

G1 was run again with database and browser flags off and with database URLs unset. Result: 195 passed, 0 failed, from `2026-11-14T23:24:48+0200` to `2026-11-14T23:24:51+0200`. Integration and Playwright were not started.

The staging manifest names every QA path and leaves the product files out. That QA commit is not self-contained, so it is not ready to create. Commit and push were not performed. Approval is still required.
