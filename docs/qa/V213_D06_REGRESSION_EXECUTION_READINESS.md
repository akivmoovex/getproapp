# V2.13.1 D06 — regression execution readiness

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. Product runtime was not changed. No database write, migration, seed, browser run, CI activation, commit, or push was performed.

`node_modules` was absent, so Supertest, Express, and Playwright could not load. Dependencies were restored with `npm ci --ignore-scripts --no-audit --no-fund`. The lockfile and `package.json` were not modified. Lifecycle scripts were not run: the root `prepare` script writes `public/apple-touch-icon.png`, and Playwright’s install script downloads browsers.

Loaded versions: Supertest 7.2.2, Express 5.2.1, `@playwright/test` 1.59.1.

## Gate check

Database flags `GETPRO_V13_ALLOW_DB_WRITES`, `GETPRO_V13_DB_STAGES_AUTHORIZED`, and `DATABASE_URL` are unset. `runGated` opens a pool only after both write flags are set. D04 and D05 now `return` immediately after `t.skip`, so an unauthorized run records `V13_RESULT=NOT_RUN` and does not reach the connection-string guard or a pool.

Browser flag `GETPRO_V13_BROWSER_AUTHORIZED` is unset. Both Playwright specs require that flag, both database-write flags, and a disposable `E2E_DATABASE_URL` before `hold()` returns. Every discovered test calls `hold()` before `page.goto`. Neither spec assigns the authorization flags or names a production host. Playwright was not executed. Browser binaries were not installed in this phase.

The unauthorized D04 and D05 HTTP run was 16 skipped, 0 failed. Each skip reason is `NOT_RUN`. The 14 older V13 integration tests also logged `V13_RESULT=NOT_RUN` and did not open a pool. Node’s runner prints those 14 as passed because `runGated` returns without `t.skip`. That printout is not verified database execution and is not included in the safe-pass total.

## Safe tests

`node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`

- Passed: 386
- Failed: 0
- Skipped: 0

These are source, contract, and unit tests. They are not end-to-end HTTP or browser execution.

## Consolidated matrix

Dependency readiness means the modules load. Database readiness and browser readiness mean an authorized run can start. Both remain blocked. Execution status is the state observed in this phase.

| Bug | HTTP test | Browser test | Implemented assertions | Dependency | Database | Browser | Execution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-AUTH-04 | `d04-critical-regression.integration.test.js` / `runAcAuth04` | `v13-ac-platform-qa.spec.js` | Neutral check page, testing outbox, invalid, mismatch, expiry, replay, then login. Old password stays rejected. | Ready | Blocked | Blocked | NOT_RUN |
| AC-REG-01 | `d04-critical-regression.integration.test.js` / `runAcReg01` | `v13-ac-platform-qa.spec.js` | Wrong password does not create a second clinic. Matching password does. | Ready | Blocked | Blocked | NOT_RUN |
| AC-WEB-08 | `d05-regression.integration.test.js` / `runAcWeb08` | `v13-ac-platform-qa.spec.js` | Add, edit, draft preview, unpublished live page, publish, other clinic denied. | Ready | Blocked | Blocked | NOT_RUN |
| AC-WEB-09 | `d05-regression.integration.test.js` / `runAcWeb09` | `v13-ac-platform-qa.spec.js` | Select and save an ActiveClinic theme, preview, publish, reject `bb.community`. | Ready | Blocked | Blocked | NOT_RUN |
| AC-REC-02 | `d05-regression.integration.test.js` / `runAcRec02` | `v13-ac-platform-qa.spec.js` | Configured service point, successful walk-in, queue shows service and patient, other clinic excluded. | Ready | Blocked | Blocked | NOT_RUN |
| AC-REC-03 | `d05-regression.integration.test.js` / `runAcRec03` | `v13-ac-platform-qa.spec.js` | Heart rate 72 persists across reload. Anonymous and other-clinic writes do not replace it. | Ready | Blocked | Blocked | NOT_RUN |
| AC-PUB-01 | `d05-regression.integration.test.js` / `runAcPub01` | `v13-ac-platform-qa.spec.js` | Disabled booking is 403, explains that booking is off, creates no appointment, and has no coupon. | Ready | Blocked | Blocked | NOT_RUN. Partial: enabled booking and coupons are not product scope. |
| BB-AUTH-04 | `d04-critical-regression.integration.test.js` / `runBbAuth04` | `v13-bb-qa-regression.spec.js` | Testing OTP stays off the page. Wrong and expired codes fail. The valid code, replay denial, and login succeed. | Ready | Blocked | Blocked | NOT_RUN |
| BB-REG-07 | `d04-critical-regression.integration.test.js` / `runBbReg07` | `v13-bb-qa-regression.spec.js` | Duplicate church phone is rejected, normalized, and does not add a row. | Ready | Blocked | Blocked | NOT_RUN |
| BB-MEM-01 | `d04-critical-regression.integration.test.js` / `runBbMem01` | `v13-bb-qa-regression.spec.js` | Mandatory fields are shown and a valid member submission persists. | Ready | Blocked | Blocked | NOT_RUN |
| BB-MEM-02 | `d04-critical-regression.integration.test.js` / `runBbMem02` | `v13-bb-qa-regression.spec.js` | Real HQ CSRF cookie and field must match. Missing and invalid tokens are denied. | Ready | Blocked | Blocked | NOT_RUN |
| BB-WEB-08 | `d05-regression.integration.test.js` / `runBbWeb08` | `v13-bb-qa-regression.spec.js` | Select, save, preview, and publish `bb.community`. Reject an ActiveClinic theme. | Ready | Blocked | Blocked | NOT_RUN |
| BB-WEB-09 | `d05-regression.integration.test.js` / `runBbWeb09` | `v13-bb-qa-regression.spec.js` | v5 sermon form, draft hidden, published sermon public on that church only. | Ready | Blocked | Blocked | NOT_RUN |
| BB-WEB-10 | `d05-regression.integration.test.js` / `runBbWeb10` | `v13-bb-qa-regression.spec.js` | v5 event form, draft hidden, published event public on that church only. | Ready | Blocked | Blocked | NOT_RUN |
| BB-ANN-01 | `d04-critical-regression.integration.test.js` / `runBbAnn01` | `v13-bb-qa-regression.spec.js` | Published announcement is public for that church. Drafts and the other church are excluded. | Ready | Blocked | Blocked | NOT_RUN |
| BB-ANN-02 | `d05-regression.integration.test.js` / `runBbAnn02` | `v13-bb-qa-regression.spec.js` | Supported upload persists, unsupported and oversized files are rejected, publish and tenant isolation are checked. | Ready | Blocked | Blocked | NOT_RUN |

Complete implementations: 15. Partial implementations: 1 (`AC-PUB-01`). None of the 16 have verified end-to-end execution.

D04 and D05 runners, Playwright scenarios, and the D04 and D05 reports were preserved. The only test edit in this phase is the `return` after `t.skip` in the two integration files.

## Next authorized run

1. Create a localhost database whose name matches `getpro_v13_(ci|bb_qa|int|e2e)_` plus 6–32 lowercase letters or digits.
2. Export `DATABASE_URL` for that database only, plus `NODE_ENV=test`, `DEPLOYMENT_ENV=testing`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, and a `GETPRO_V13_CI_RUN_ID` of 8–64 safe characters.
3. Export both `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`.
4. Run `node --test --test-concurrency=1 tests/v13/integration/d04-critical-regression.integration.test.js tests/v13/integration/d05-regression.integration.test.js`.
5. For browsers, point `E2E_DATABASE_URL` at that same disposable database, set `GETPRO_V13_BROWSER_AUTHORIZED=1`, install the Playwright 1.59.1 browser binary if it is not already present, and run the V13 BlessBoard and ActiveClinic Playwright configs. Do not run them before those flags exist.
6. Leave enabled public booking and coupon generation unimplemented until that product scope is approved.
