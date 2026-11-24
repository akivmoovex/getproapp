# V13 G107 full regression results

Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. HTTP and Playwright did not run at the same time.

| Suite | Executed | Passed | Failed | Skipped | Log |
| --- | --- | --- | --- | --- | --- |
| Safe | 528 | 526 | 0 | 2 | `g107-safe2.log` |
| HTTP run 1 | 34 | 30 | 4 | 0 | `g107-http1.log` |
| HTTP run 2 | 34 | 30 | 4 | 0 | `g107-http2.log` |
| ActiveClinic Playwright run 1 | 20 | 20 | 0 | 0 | `g107-ac1.log` |
| ActiveClinic Playwright run 2 | 20 | 20 | 0 | 0 | `g107-ac2.log` |
| BlessBoard Playwright run 1 | 23 | 19 | 4 | 0 | `g107-bb1.log` |
| BlessBoard Playwright run 2 | 23 | 19 | 4 | 0 | `g107-bb2.log` |

Combined Playwright for each complete pass is 43 executed, 39 passed, 4 failed, 0 skipped.

HTTP failures, both runs: D14C OTP, D16 platform OTP, D25 slot, D25 overlap.

BlessBoard failures, both runs: BB-06 member login, INV-01 accept, INV-01 login, BB-AUTH-04.

No test was removed. The skip count stayed at 2.
