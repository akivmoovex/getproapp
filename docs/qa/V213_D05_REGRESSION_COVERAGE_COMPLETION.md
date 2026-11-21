# V2.13.1 D05 — regression coverage completion

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. Product runtime was not changed. No database write, reset, Playwright run, dependency install, commit, or push was performed.

Implemented coverage means the assertion is in source. Verified passing coverage means the suite executed and passed. The gated HTTP and browser suites are implemented and classified `NOT_RUN`. They are not verified passing.

Safe source contracts that did run: `d04-critical-regression-contract.test.js`, `d05-regression-coverage-contract.test.js`, and `d19-qa-implementation.test.js`. Result: 8 passed, 0 failed. Those contracts read source. They do not load the HTTP runners, because `supertest` is declared in `package.json` and is absent from `node_modules`.

Unauthorized HTTP tests call `t.skip` with `V13_RESULT=NOT_RUN`. Browser tests call `hold()` before navigation. `hold()` throws `NOT_RUN` until disposable browser authorization is present.

## D04 suites preserved

These uncommitted D04 files were left in place and were not edited in D05:

- `tests/v13/integration/d04CriticalRegressionRunners.js`
- `tests/v13/integration/d04-critical-regression.integration.test.js`
- `tests/v13/contract/d04-critical-regression-contract.test.js`
- `docs/qa/V213_D04_CRITICAL_REGRESSION_TESTS.md`

The D04 cases already present in the two Playwright specs and the D19 count assertions were kept. D19 counts were updated only so the new D05 tests stay inside the existing discovery contract: 23 BlessBoard browser tests, 14 ActiveClinic browser tests, 15 gated integration files.

## D05 scenarios

| Bug | Files | Assertions implemented | Missing | Execution |
| --- | --- | --- | --- | --- |
| AC-WEB-08 | `d05RegressionRunners.js` `runAcWeb08`; `d05-regression.integration.test.js`; `v13-ac-platform-qa.spec.js` | Add a text section, save heading and body as a visible draft, preview shows the heading, the live page does not, publish shows it, and another clinic cannot replace it. | None in the requested flow. | HTTP and browser, both NOT_RUN |
| AC-WEB-09 | `runAcWeb09`; integration file; ActiveClinic Playwright spec | Gallery offers an ActiveClinic theme. `bb.community` is rejected with `invalid_theme` and stays unpublished. `ac.family-wellness-mint` saves as a draft, preview carries that theme, and the public page carries `gp-website-theme--ac-family-wellness-mint` after publish. | None in the requested flow. | HTTP and browser, both NOT_RUN |
| AC-REC-02 | `runAcRec02`; integration file; ActiveClinic Playwright spec | A patient is registered and the success page shows `AC-YYYY-NNNNNN`. The walk-in form lists a service point. Submit redirects to that clinic queue and the queue shows the patient number and service name. The other clinic’s form does not list that service-point id and cannot check in the first patient. | None in the requested flow. An authorized run fails closed if the registering administrator has no reception department. | HTTP and browser, both NOT_RUN |
| AC-REC-03 | `runAcRec03`; integration file; ActiveClinic Playwright spec | The persisted patient id starts an encounter. The vitals page offers Heart rate. Saving 72 bpm redirects with `recorded=1`, and reload shows `72 bpm`. An anonymous post is 401 or 403. Another clinic’s post is not a successful save, and reload still shows 72 bpm rather than 140 bpm. The browser journey reads the patient id with a SELECT only after `hold()`, because the success page shows the patient number and the start-encounter form requires the id. | None in the requested flow. An authorized run fails closed if the administrator has no clinical department. | HTTP and browser, both NOT_RUN |
| AC-PUB-01 | `runAcPub01`; integration file; ActiveClinic Playwright spec | A newly registered clinic’s `GET` and `POST /clinics/:key/book` are 403, say online booking is not enabled, say the page does not take live bookings, do not contain the word coupon, and do not confirm an appointment. The clinic’s appointment count stays 0. | Enabled booking wizard, confirmation, and coupon redemption. Those behaviors are not in the product. | Disabled-state HTTP and browser NOT_RUN. Enabled booking and coupons are pending product scope, not failing tests. |
| BB-WEB-08 | `runBbWeb08`; integration file; BlessBoard Playwright spec | The theme gallery lists a BlessBoard theme and not `ac.family-wellness-mint`. That clinic theme is rejected with `invalid_theme`. `bb.community` saves unpublished, draft preview carries it, and the public home page carries `gp-website-theme--bb-community` after publish. | None in the requested flow. | HTTP and browser, both NOT_RUN |
| BB-WEB-09 | `runBbWeb09`; integration file; BlessBoard Playwright spec. Existing service runner `runBb04` and the legacy branch-form browser test were not replaced. | The v5 create form opens. A draft sermon is in the management list and in `blessboard.sermons` as `draft`, and is absent from `[data-bb-sermons="1"]`. A confirmed published sermon appears on that church’s public page and is absent from the other church’s public page and management list. | None for the v5 public and isolation outcomes. | New HTTP and browser tests NOT_RUN. Older service tests were not executed. |
| BB-WEB-10 | `runBbWeb10`; integration file; BlessBoard Playwright spec. Existing `runBb03` and the legacy event browser test were not replaced. | The v5 event form accepts title, summary, start, end, timezone, and location. The draft is stored and hidden on `[data-bb-events="1"]`. The confirmed published event appears on that church’s public page and not on the other church’s page. | None for the v5 public and isolation outcomes. | New HTTP and browser tests NOT_RUN. Older service tests were not executed. |
| BB-ANN-02 | `runBbAnn02`; integration file; BlessBoard Playwright spec. Existing `runBb02` and `tests/v2-02-announcements-document-upload-regression.test.js` were not run and were not treated as this gate. | The editor opens. A PNG upload returns the asset id and filename. HTML is rejected. An image over 5 MiB is rejected with 400 or 413. The draft detail shows the filename. After publish, the public detail contains the filename or asset id. The other church’s public page and media route do not. | Public rendering of a private asset is asserted where the detail template prints the filename or asset id. If the product omits private files from public HTML, the authorized public assertion fails closed. | HTTP and browser, both NOT_RUN |

## All 16 bugs

| Bug | Classification | Implementation | Verified passing |
| --- | --- | --- | --- |
| AC-AUTH-04 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| AC-REG-01 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| AC-WEB-08 | HTTP and browser | Complete | No. NOT_RUN |
| AC-WEB-09 | HTTP and browser | Complete | No. NOT_RUN |
| AC-REC-02 | HTTP and browser | Complete | No. NOT_RUN |
| AC-REC-03 | HTTP and browser | Complete | No. NOT_RUN |
| AC-PUB-01 | HTTP and browser | Partial: disabled booking only | No. NOT_RUN |
| BB-AUTH-04 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| BB-REG-07 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| BB-MEM-01 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| BB-MEM-02 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| BB-WEB-08 | HTTP and browser | Complete | No. NOT_RUN |
| BB-WEB-09 | HTTP and browser | Complete for the missing v5 public and isolation outcomes | No. NOT_RUN |
| BB-WEB-10 | HTTP and browser | Complete for the missing v5 public and isolation outcomes | No. NOT_RUN |
| BB-ANN-01 | HTTP and browser | Complete, from D04 | No. NOT_RUN |
| BB-ANN-02 | HTTP and browser | Complete | No. NOT_RUN |

## Booking and coupons

Public appointment booking stays off unless a supported clinic setting enables it. D05 does not enable booking and does not add coupon fields. The tests cover the current disabled response only.

Pending product scope, not implemented and not asserted as success:

- An enabled public booking wizard.
- A booking confirmation.
- Coupon entry, validation, or redemption.

## Blockers

- Disposable database writes are not authorized, so every new HTTP test skips as `NOT_RUN`.
- Disposable browser execution is not authorized, so every new Playwright test stops in `hold()` as `NOT_RUN`.
- `supertest` is not installed. The HTTP runners were syntax-checked with `node --check` and were not loaded.
- Enabled booking and coupons are absent from ActiveClinic. No coupon field was added to the product or to a success assertion.
