# Regression results

Branch `V13` is `b8f6b420d25e908de64ba292866c218c32edc30c`, matching `origin/V13`. The index is empty. The worktree has 80 product files, 100 test files, 248 QA files, 4 held workflows, and 4 other files. No migration is dirty.

`node --check` passed on 163 dirty JavaScript files. The repository has no lint script. The G1 command included the unit and contract files, the shared website and BlessBoard member tests, the platform-admin RBAC test, and the OTP unit tests that live in `tests/v13/unit`. It did not include integration files or Playwright. The log contains no `not ok` line.

| | |
|---|---|
| Log | `/tmp/d53-g1.log` |
| Finished | `2026-11-15T00:36:35+0200` |
| Duration | 4457 ms |
| Executed | 308 |
| Passed | 308 |
| Failed | 0 |
| Skipped | 0 |
| Exit | 0 |

No failing test appeared, so no runtime file was changed in this stage. BlessBoard, patient portal, and appointment checks are inside that 308. They are in-process. D22’s 195 passes remain historical.
