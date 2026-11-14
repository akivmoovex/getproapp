# V2.13 D17 final overnight report

HEAD remained `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13`. `git diff --check` was clean. No commit, push, database write, migration execution, email, SMS, deployment, or workflow dispatch.

## What ran

`npm run test:v13:contract`: 144 passed, 0 failed. That includes the new BlessBoard, ActiveClinic, platform, and OTP behavior tests.

`npm run test:v13:d17`: 16 passed, 0 failed. The three mutation probes are in that command and are not inside the contract glob.

`npm run test:v13:integration:gated`: 11 records, all `NOT_RUN`.

`tests/v213-version-initialization.test.js`: 3 passed.

## Coverage

c8 10.1.3, same changed-file method as D16. Full-product `npm run test:coverage:*` was not run.

| Area | D16 statements | D17 statements | D16 branches | D17 branches |
|---|---|---|---|---|
| BlessBoard changed JavaScript | 17.34% (2042/11779) | 20.58% (2424/11779) | 59.11% (357/604) | 57.53% (443/770) |
| ActiveClinic original five files | 4.30% (208/4826) | 4.93% (238/4826) | 13.33% (2/15) | 58.62% (17/29) |
| Platform OTP, session, startup | 83.30% (1417/1701) | 86% (1463/1701) | 66.73% (305/457) | 68.81% (331/481) |

BlessBoard covered more statements and more branches. The branch percentage fell because loading the services instrumented additional branches, so the denominator grew. ActiveClinic route modules are still mostly unread by the test process. Authorization service line coverage is 60.86% (238/391). Appointment service line coverage is 22.16% (225/1015). Those route gaps are why a higher percentage would still be insufficient.

## Repair

One production defect: the ActiveClinic app organisation switch minted a session with no OTP workflow. It is fixed locally and covered by a regression test.

## Still insufficient

Database persistence, browser journeys, INV-01 first login, live AC-05 denial, patient activation persistence, appointment conflict persistence, and production OTP. The release stays blocked.
