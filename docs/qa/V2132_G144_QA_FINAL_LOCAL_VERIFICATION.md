# V2.13.2 G144 — final local verification

Database-free, HTTP, and Playwright commands ran twice after the final source change. Counts from the two runs are not added together. The database was `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Port 5432 was not used. No migration was applied. No email was sent.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Database-free | 571 executed, 569 passed, 0 failed, 2 skipped | 571 executed, 569 passed, 0 failed, 2 skipped |
| HTTP | 35 executed, 32 passed, 3 failed | 35 executed, 32 passed, 3 failed |
| Playwright | ActiveClinic 26 passed, BlessBoard 23 passed | ActiveClinic 26 passed, BlessBoard 23 passed |

The two skipped database-free tests are the PostgreSQL identity checks that skip when no database URL is configured.

## HTTP gates

| Gate | Result |
| --- | --- |
| D14C OTP | Failed. `platform.otp_challenges` is absent. `BLOCKED_BY_MIGRATION` |
| D16 platform OTP | Failed for the same missing table. `BLOCKED_BY_MIGRATION` |
| D16 ActiveClinic auth | Passed in both official runs |
| D25 slot | Failed. `BLOCKED_APPROVAL_REQUIRED` |
| D25 overlap | Passed, including the two-client same-staff test, in both official runs |

## Fixture repair

One HTTP run before the phone repair failed D16 ActiveClinic auth with `registration did not return a facility and administrator` for the second synthetic clinic. The HTTP isolator was reusing only the last three digits of the contact phone. After hundreds of clinics, that phone matched an existing registration and the new call did not return a facility. `uniqueFixturePhone` now keeps the `+260977` prefix and changes six trailing digits. `tests/v13/unit/g146-fixture-phone.test.js` locks that shape. The two HTTP runs above are the runs after that repair.

## Versions

BlessBoard and ActiveClinic About templates in this worktree display `2.13.2`.
