# V2134 G318 BlessBoard login OTP end to end

**FINAL=V2134_G318_BB_LOGIN_OTP_E2E**

Date: 27 November 2026  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Branch: `V13`  
Base at start: `80b2e2c96311ceacd1b61f5b70f1d2361eeabd5e`  
Versions: ActiveClinic `2.13.4`, BlessBoard `2.13.4`

| Field | Value |
| --- | --- |
| FINAL_SHA | this G318 commit on `origin/V13` |
| REMOTE_MATCH | recorded after the push |
| D161_INCLUDED | YES, only when `GETPRO_BB_LOGIN_OTP_OBSERVER=1` |
| D161_EXECUTED | 10 |
| D161_PASS | 10 |
| D161_FAIL | 0 |
| EXPIRED_DISTINCT | YES |
| SECOND_TENANT_DENIAL | YES |
| SESSION_WITHHELD | YES |
| REPLAY_DENIED | YES |
| BB_BROWSER_RUN_1 | 23 pass / 0 fail |
| BB_BROWSER_RUN_2 | 23 pass / 0 fail |
| OTP_POSTGRESQL | 4 pass / 0 fail, twice |
| SAFE_TESTS | 677 pass / 0 fail, twice |
| NEW_SECURITY_TESTS | 5 unit + 10 browser |
| P0_OPEN | 0 |
| P1_OPEN | 0 |
| PUSH | recorded after the push |
| DEPLOYMENT | NOT_PERFORMED |
| MAIN_UNCHANGED | YES |
| NEXT_ACTION | G319 |

No email was sent. No OTP code, API key, pepper, mailbox, or database password is recorded here. `NOT_RUN` is not counted as a pass.

## What changed

D161 is selected by the isolated BlessBoard Playwright config only when the login-OTP observer fixture is set. The regression match stays `v13-bb-qa-regression.spec.js` otherwise, so CI and the staff suite do not activate member-login OTP. The D161 server sets `GETPRO_OTP_PROVIDER=qa-observer` and does not set `GETPRO_OTP_ACTIVATION`, so staff sign-in stays on the historical path.

The observer stores a code only in the authorized testing process. A read requires the fixture flag, the testing deployment identity, browser and database-stage authorization, and a loopback socket address. Production startup rejects `qa-observer` and any `GETPRO_BB_LOGIN_OTP_OBSERVER` value. A missing fixture, a non-loopback caller, and production all return `not_found` with no code field. The verify page carries the attempt id and does not render the code.

Synthetic members are inserted on church A and church B, each with an active branch membership, and removed by the `@d161.v13d19.example` email suffix. The expired case submits the captured code after the pending row is moved into the past while `expires_at` stays after `created_at`. The wrong-code case still submits `000000` and expects `invalid_code`.

## Executed D161 cases

Both focused runs passed 10 / 0. Port `4188`. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

| Case | Result |
| --- | --- |
| Login form reachable from the keyboard | PASS |
| Correct identity issues a challenge and withholds the session | PASS |
| Wrong code `000000` returns `invalid_code` and no session | PASS |
| Expired captured code returns `expired` and no session | PASS |
| Correct code opens the member dashboard for that member and church, and reload keeps it | PASS |
| Replaying the consumed code returns 401 and "already used" | PASS |
| Church A code submitted on church B does not sign in | PASS |
| Member A code submitted on member B returns `invalid_code` | PASS |
| Two concurrent completions produce one HTTP 303 | PASS |
| Five wrong attempts exhaust the challenge; the real code then does not sign in | PASS |
| Missing attempt id returns 400; unknown attempt id returns 404; neither body contains a code | PASS |

Production rejection of the observer, and fail-closed behavior when the fixture flag is absent, ran in `tests/v13/unit/g318-login-otp-observer.test.js` (5 tests, inside the safe suite). The live browser server is the testing process, so those two cases are unit executions rather than a second hosted process.

## Other suites

BlessBoard regression, twice, 23 / 0, including D14C with no one-time code field after staff sign-in and BB-AUTH-04 recovery. The regression server did not select D161.

PostgreSQL D14C, D16, G185, and G272, twice, 4 / 0. G272 still leaves mailbox delivery `NOT_EXECUTED` and Resend `BLOCKED_MISSING_CREDENTIALS`.

`npm run test:v13:contract`, twice, 677 / 0. That is the previous 672 plus the 5 new observer tests. No database was opened by that suite.

## Boundaries

No schema was added. No database was created, reset, or migrated. `db/migrations/platform/048_otp_challenges.sql` stays absent. `deliveryActivated` stays false. No hosted service was restarted. `main` stayed `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` were left untracked.

Live email delivery remains closed. This run does not change that gate.
