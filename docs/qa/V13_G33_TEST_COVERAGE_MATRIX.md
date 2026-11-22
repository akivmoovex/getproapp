# V13 G33 — test coverage matrix

No new test file was added. A source-string test would not create the missing HTTP or browser evidence. Existing tests assert returned codes or stored field mapping. Gated HTTP and Playwright files stay fail-closed.

| Requirement | Unit or contract | HTTP | Browser | Latest safe result | HTTP and browser |
| --- | --- | --- | --- | --- | --- |
| Patient duplicate and merge | `g02-patient-journey.test.js` | D04 AC-REG-01 | Playwright AC-REG-01 | SAFE_PASS | NOT_RUN |
| Closeout without scope | `g09-g12-hardening.test.js` | None executed | None | SAFE_PASS | NOT_RUN |
| Two strong matches | Same file | None | None | SAFE_PASS | NOT_RUN |
| Lab priority and ranges | `g03-laboratory.test.js` | `g03-laboratory.integration.test.js` | G03 denial | SAFE_PASS | NOT_RUN |
| Prescription fields | `g04-pharmacy-billing.test.js` | `g04-pharmacy-billing.integration.test.js` | G04 denial | SAFE_PASS | NOT_RUN |
| Records and disposal | `g05-records.test.js` | `g05-records.integration.test.js` | G05 denial | SAFE_PASS | NOT_RUN |
| Sermons, events, OTP, media flag | `g06-blessboard.test.js` | D04 and D05 | `v13-bb-qa-regression.spec.js` | SAFE_PASS | NOT_RUN |
| Audit redaction and appointments | `g07-shared-platform.test.js` and `g09-g15` contract | D04 | AC platform spec | SAFE_PASS | NOT_RUN |
| Reception and vitals | `d17` and `d26-d27` | D05 | AC-REC-02 and AC-REC-03 | SAFE_PASS | NOT_RUN |
| Member CSRF and fields | `d14-member-registration.test.js` | D04 | BB member spec | SAFE_PASS | NOT_RUN |

`NOT_RUN` is not a pass. The safe suite result is recorded in G34.
