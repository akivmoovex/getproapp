# Regression results

Branch `V13`. HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. Worktree `/private/tmp/getpro-v13`.

| Check | Command result |
|---|---|
| Syntax of the 12 product files changed in D72–D77 | `SYNTAX_OK` |
| Lint | No `lint` script in `package.json`. Not run |
| G1 | `/tmp/d78-g1.log`, finished `2026-11-15T01:38:31+0200`, 5218 ms |
| Executed | 399 |
| Passed | 399 |
| Failed | 0 |
| Skipped | 0 |

The command was `node --test` on `tests/v13/contract`, `tests/v13/unit`, the D17 mutation probes, and the BlessBoard and version files used by earlier G1 runs. `NODE_ENV=test`. Both write flags and the browser flag were `0`. `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` were unset.

Included in that run, and not run as a live session:

| Area | Where it was executed |
|---|---|
| BlessBoard | Shared website lifecycle and HQ add-member contract tests |
| Patient portal | D47, D64, and D72 unit and contract tests |
| Appointments | D65 overlap and idempotency tests. No row lock |
| Clinical workflow | D66, D73, and D74 service tests |
| Finance | D65 and D74 payment and reversal tests |
| Documents | D75 and D77 finalization tests |
| Supplementary | D76 consent allow-list and the absent outbox, route, and signing checks |
| OTP | Existing OTP unit tests. No production bypass |
| HTTP and AC-05 | In-process contract only. Not a live 403 |

Prepared and not run: 13 integration files and 7 browser tests. They are not part of the 399.
