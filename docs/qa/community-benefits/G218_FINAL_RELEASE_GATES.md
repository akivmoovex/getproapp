# G218 final release gates

Cycle evidence is from two complete runs after source `e63fc672132062080bfbeea81c46e790a4307808`. No source file changed during the runs. Blocked results are not passes.

| Gate | Run 1 | Run 2 | Pass counted |
| --- | --- | --- | --- |
| Safe suite | 594 executed, 592 passed, 0 failed, 2 skipped | same | 592 |
| Community unit, contract, and HTTP-route tests inside that suite | 11 passed | 11 passed | included in 592 |
| Security-focused community tests inside that suite | 6 passed | 6 passed | 6, not an extra suite |
| Authorized HTTP suite | 36 executed, 33 passed, 3 failed | same | 33 |
| D14C OTP | FAIL, table absent | FAIL | no |
| D16 platform OTP | FAIL, table absent | FAIL | no |
| D25 slot capacity | FAIL, `APT-01-03_NOT_IMPLEMENTED` | FAIL | no |
| D25 same-staff overlap | PASS | PASS | yes |
| Community browser | 8 passed, mock-backed | 8 passed | 8 mock, 0 PostgreSQL |
| ActiveClinic Playwright | 30 passed | 30 passed | 30 existing |
| BlessBoard Playwright | 23 passed | 23 passed | 23 existing |
| Community PostgreSQL persistence | not passed | not passed | 0 |

The six security-focused tests are the schema-and-flag contract, the forged and cross-clinic case, the QR revocation case, the link isolation case, the flag-off HTTP case, and the pass-actor case.

Community Benefits QA is NO-GO. V2.13.2 is not release ready. The next action is an approval to apply the reviewed schema on the disposable database only, followed by a commercial and legal approval before any agreement can become active. Do not deploy.
