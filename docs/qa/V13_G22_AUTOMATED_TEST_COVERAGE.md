# V13 G22 — automated test coverage

A new string-only test was not added. The rows below name tests that assert a result, a rejected code, or a SQL predicate. Browser files exist and were not run. `NOT_RUN` is not a pass.

| ID | File | Type | Assertion | Needs DB or browser | Latest result |
| --- | --- | --- | --- | --- | --- |
| AC-IDENTITY | `tests/v13/unit/g02-patient-journey.test.js` | Unit | Merge returns `merge_deferred`. Unknown vital type returns `invalid_input` before a query | No | SAFE_PASS |
| AC-VISITS | `tests/v13/unit/g09-g12-hardening.test.js` | Unit | Closeout without scope does not query | No | SAFE_PASS |
| AC-MATCH | Same file | Unit | Two strong matches stay `review_required` | No | SAFE_PASS |
| AC-LAB-ORDER | `tests/v13/unit/g03-laboratory.test.js` | Unit | Priority `high` is rejected before a query. A result without a range does not set abnormal | No | SAFE_PASS |
| AC-RX | `tests/v13/unit/g04-pharmacy-billing.test.js` | Unit | Missing dose is rejected. `14 tablets` is not parsed into a quantity | No | SAFE_PASS |
| AC-RECORDS | `tests/v13/unit/g05-records.test.js` | Unit | File bytes are refused. Disposal returns `deleted: false` | No | SAFE_PASS |
| BB-SERMON-EVENT | `tests/v13/unit/g06-blessboard.test.js` | Unit | Sermon date becomes `preachedAt`. Production OTP send fails | No | SAFE_PASS |
| SHARED-AUDIT | `tests/v13/unit/g07-shared-platform.test.js` | Unit | Password and OTP keys are removed from audit metadata | No | SAFE_PASS |
| AC-HTTP | `tests/v13/integration/g03-laboratory.integration.test.js`, `g04`, `g05`, D04, D05 | Gated HTTP | Real runners exist. They skip unless disposable writes are authorized | Yes | NOT_RUN |
| AC-BROWSER | `tests/e2e/v13/v13-ac-platform-qa.spec.js` | Playwright | Walk-in, vitals, and receptionist denials for lab, pharmacy, documents, and the worklist | Yes | NOT_RUN |
| BB-BROWSER | `tests/e2e/v13/v13-bb-qa-regression.spec.js` | Playwright | Member, sermon, event, and announcement journeys | Yes | NOT_RUN |

The full safe suite on this HEAD passed 467 and failed 0. That count includes these unit and contract tests. It does not include the gated HTTP or Playwright files.
