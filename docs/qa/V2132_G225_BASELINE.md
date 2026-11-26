# G225 baseline

Actual starting point: branch `V13`, local and `origin/V13` at
`df517e571ae076b79e01fac5f85e0039c2e3682e` after G224. The prompt's
`f2ea819...` value is stale and was not used as the working tip.

Local `main` remains `44eafec486a18aeef2777bbcc9683e43f68ebe0d`; remote
`origin/main` remains `a802fc3fd503733767011798d3f90bf83058c7dd`.

Versions remain ActiveClinic 2.13.2 and BlessBoard 2.13.2. The worktree had
only the pre-existing excluded untracked files `bb-lifecycle.log` and
`docs/qa/V2131_GAP_G08_FINAL_REPORT.md`.

The two named 25 November DOCX reports were searched for in the worktree,
Downloads, Documents, and indexed local files and were not available. The
reconciliation therefore uses the findings explicitly supplied in G224 and
prior repository reports; it does not invent missing report rows.

Safety confirmed:

- no migration execution or database reset;
- no shared PostgreSQL 5432 access;
- disposable target remains `127.0.0.1:55432/getpro_v13_e2e_g78d2301`;
- production OTP, public booking, production uploads, financial posting, and deployment remain disabled;
- existing V13 database and browser mutation guards remain in use.

G224 baseline before this audit was safe 598/596/0/2, HTTP 37/34/3,
ActiveClinic browser 31, BlessBoard browser 23, and Community mock browser 9.
