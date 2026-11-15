# Local QA results

SHA under test: `c2cd146b01c6a9cfd92db65c2862320892c0888c` after the commit. The tests ran on the same tree before the commit, at `2026-11-15T01:43:49+0200`. `NODE_ENV=test`. Both write flags and the browser flag were `0`. Database URLs were unset.

| Command | Log | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| G1 `node --test` on `tests/v13/contract`, `tests/v13/unit`, the D17 probes, and the BlessBoard files used by earlier G1 runs | `/tmp/d80-g1.log` | 399 | 399 | 0 | 0 |
| `npm run test:v13:ac` | `/tmp/d80-stage-a.log` | 14 | 14 | 0 | 0 |

`node --check` passed for `productionStartupChecks.js`, `otpEnvironment.js`, and `otpService.js`. There is no `npm run lint` script. CSS lint was not run.

The G1 run includes the in-process HTTP, security, and OTP tests. It does not include the 13 integration files or the 7 browser tests. A required `NOT_RUN` acceptance row is not a pass. The D79 acceptance file has 84 rows and zero `PASS` rows.
