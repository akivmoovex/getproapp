# G1 results

D101 is the fresh run. It finished `2026-11-15T03:56:00+0200`, passed 420, failed 0, and skipped 0. Log: `/tmp/d101-g1.log`. CSS lint passed. Log: `/tmp/d101-lint.log`.

The run includes the D86 through D98 unit and contract tests and the D96 YAML regression. It includes the OTP check that refuses code `1234` when `NODE_ENV` is production. It does not include the thirteen integration files or the seven Playwright tests. A G1 pass is not acceptance verification.
