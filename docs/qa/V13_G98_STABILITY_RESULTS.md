# V13 G98 stability results

| Suite | Executed | Passed | Failed | Skipped | Not run |
| --- | --- | --- | --- | --- | --- |
| Safe, latest | 528 | 526 | 0 | 2 | 0 |
| HTTP, first of the pair | 34 | 30 | 4 | 0 | 0 |
| HTTP, repeat | 34 | 30 | 4 | 0 | 0 |
| Playwright, latest | 43 | 20 | 23 | 0 | 0 |

The two HTTP runs failed on the same four blocked tests. Safe tests passed after the test-only OTP IP cap change.

Public booking stayed disabled. Media uploads stayed disabled. Production OTP stayed disabled. The disposable database identity and port were checked before the HTTP runs. Shared PostgreSQL and the original QA database were not used.

The browser totals match the previous full browser run. That is stability of the remaining failures, not a green suite.
