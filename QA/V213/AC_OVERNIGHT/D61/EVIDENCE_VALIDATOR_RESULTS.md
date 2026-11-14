# Evidence validator results

The unit file `tests/v13/unit/d61-evidence-validator.test.js` passed 3 and failed 0.

| Fixture | Exit | What was rejected |
|---|---|---|
| `fixtures/false-pass.json` | 1 | `TEN-01-01` marked `PASS` with database `NOT_RUN`, mock coverage, no SHA, no run id, G2 not run, and release claimed |
| `fixtures/missing-and-skip.json` | 1 | `SEC-01-02` marked `PASS` without a live 403, `APT-01-03` marked `PASS` from a skip, production identity, missing run id, and release claimed without G3 or G4 |
| `fixtures/honest-not-run.json` | 0 | No passes. `releaseBlocked` is true |

The false-pass fixture produced nine failures: six on `TEN-01-01` and three on the release claim. No case was changed to `PASS` in the real matrix.
