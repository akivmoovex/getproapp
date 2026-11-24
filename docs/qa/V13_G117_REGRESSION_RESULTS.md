# V13 G117 regression results

Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. HTTP and Playwright did not run together.

| Suite | Executed | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Safe | 531 | 529 | 0 | 2 |
| HTTP run 1 | 34 | 30 | 4 | 0 |
| HTTP run 2 | 34 | 30 | 4 | 0 |
| ActiveClinic Playwright run 1 | 20 | 20 | 0 | 0 |
| ActiveClinic Playwright run 2 | 20 | 20 | 0 | 0 |
| BlessBoard Playwright final run 1 | 23 | 23 | 0 | 0 |
| BlessBoard Playwright final run 2 | 23 | 23 | 0 | 0 |

Combined Playwright for each complete cycle is 43 executed, 43 passed, 0 failed, 0 skipped.

HTTP failures, both runs: D14C OTP, D16 platform OTP, D25 slot, D25 overlap.

An earlier BlessBoard full run failed the last two tests because the administrator sign-in limit is 20. Those extra sign-ins were removed. The two runs after that change passed 23 of 23. The production limit stayed 20.
