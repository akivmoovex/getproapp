# G163 full execution

Official pair after the last test edit. Counts are per run. The two runs are not added together.

## Safe suite

Command is the database-free contract, unit, and quality set. `RESEND_API_KEY` and database URLs were unset.

| Run | Executed | Passed | Failed | Skipped | Exit |
| --- | --- | --- | --- | --- | --- |
| A | 572 | 570 | 0 | 2 | 0 |
| B | 572 | 570 | 0 | 2 | 0 |

The two skips are the PostgreSQL identity checks when no database URL is configured.

## HTTP suite

Runner `.v13-isolated-pg/g79-run.cjs`. Preflight required `getpro_v13_e2e_g78d2301` on port 55432.

| Run | Churches | Clinics | Executed | Passed | Failed | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| A | 74 | 817 | 35 | 32 | 3 | 1 |
| B | 74 | 834 | 35 | 32 | 3 | 1 |

Failures, both runs, and no others:

- D14C `keeps production activation blocked and requires a shared challenge row`
- D16 `requires the challenge table before a second worker can verify the same code`
- D25 `keeps simultaneous slot booking unexecuted`

Same-staff overlap and the two-client booking passed in both runs. D16 ActiveClinic auth passed in both runs.

## Playwright

| Run | ActiveClinic | BlessBoard |
| --- | --- | --- |
| A | 28 passed, 0 failed | 23 passed, 0 failed |
| B | 28 passed, 0 failed | 23 passed, 0 failed |

No test was deleted, skipped, or weakened to produce these counts. The three HTTP failures remain.
