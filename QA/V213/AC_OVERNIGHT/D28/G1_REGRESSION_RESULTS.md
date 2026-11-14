# G1 regression results

D22 baseline, from `QA/V213/AC_OVERNIGHT/D22/G1_EXECUTION_RESULTS.md`:

| Result | Count |
|---|---|
| Executed | 195 |
| Passed | 195 |
| Failed | 0 |
| Skipped | 0 |

That run included the v2-02 RBAC file and finished at `2026-11-14T23:19:17+0200`.

D28 rerun, same flags and the same file arguments. Later contract and unit files are picked up by the globs.

Started `2026-11-14T23:35:47+0200`. Finished `2026-11-14T23:35:50+0200`. Exit 0. Log `/tmp/d28-g1.log`.

| Result | Count |
|---|---|
| Discovered | 233 |
| Executed | 233 |
| Passed | 233 |
| Failed | 0 |
| Skipped | 0 |
| Cancelled | 0 |
| Suites | 47 |

Flags were `GETPRO_V13_ALLOW_DB_WRITES=0`, `GETPRO_V13_DB_STAGES_AUTHORIZED=0`, `GETPRO_V13_BROWSER_AUTHORIZED=0`, and `NODE_ENV=test`. Database URLs were unset. The log has no `not ok` line and no `tests/v13/integration` path.

The 38 tests above the D22 count are the later in-process checks, including AC-05, patient portal, appointments, OTP, and the clinical source contracts. They do not close a release gate.

Thirteen integration files and both Playwright specs stay outside this command. Their status is not run. A gated not-run record is not a pass.
