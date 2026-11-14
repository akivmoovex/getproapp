# Next Cursor prompt

Paste this only after naming which design decisions, if any, are approved. Do not treat this file as that approval.

```
MODE: AUTONOMOUS
NO QUESTIONS
BRANCH: V13
WORKTREE: /private/tmp/getpro-v13
HEAD MUST REMAIN: b8f6b420d25e908de64ba292866c218c32edc30c until a commit is explicitly approved.

Read QA/V213/AC_OVERNIGHT/D36/D36_FINAL_REPORT.md.

Do not commit.
Do not push.
Do not run git add -A.
Do not open a database.
Do not send OTP.
Do not add a migration.
Do not mark any of the 84 acceptance IDs or any ACX row as PASS.

If this message does not name an approved decision from the D36 register, stop.
If it names one decision, implement only that decision, keep every other pending default, and do not change portal registration or appointment create except where that decision says so.
```
