# Next Cursor prompt

Paste this only after deciding whether the QA list may be committed. Do not paste it as permission to implement clinical work.

```
MODE: AUTONOMOUS
NO QUESTIONS
BRANCH: V13
WORKTREE: /private/tmp/getpro-v13
HEAD MUST REMAIN: b8f6b420d25e908de64ba292866c218c32edc30c until a commit is explicitly approved.

Read QA/V213/AC_OVERNIGHT/D28/D28_FINAL_REPORT.md and QA_COMMIT_MANIFEST.md.

Do not commit.
Do not push.
Do not run git add -A.
Do not edit product code.
Do not open a database.
Do not send OTP.
Do not mark any of the 84 acceptance rows as PASS.

If the user has approved a QA-only commit in this message, stage only the paths in QA_COMMIT_MANIFEST.md, leave every src, views, public, and package.json path unstaged, and stop before push.

Otherwise stop after confirming HEAD, the empty index, and that G2, G3, G4, AC-05 live denial, patient persistence, and appointment persistence are still not run.
```
