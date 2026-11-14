# Activation test results

Safe suite started `2026-11-14T23:28:09+0200` and finished `2026-11-14T23:28:12+0200`. Exit 0.

```
node --test --test-concurrency=1 \
  tests/v13/contract/*.test.js \
  tests/v13/unit/*.test.js \
  tests/v13/quality/d17-mutation-probes.test.js \
  tests/shared-website-section-lifecycle.test.js \
  tests/bb05-hq-add-member-csrf-contract.test.js \
  tests/v211-hq-add-member-get.test.js \
  tests/v213-version-initialization.test.js
```

`DATABASE_URL` was unset. Both write flags and the browser flag were `0`.

| Result | Count |
|---|---|
| Tests | 197 |
| Passed | 197 |
| Failed | 0 |

The new files in that run are `tests/v13/unit/d24-patient-portal-security.test.js` (8) and `tests/v13/contract/d24-patient-portal-contract.test.js` (4).

`tests/v13/integration/d24-patient-portal.integration.test.js` was run separately. The gate printed `V13_RESULT=NOT_RUN` and did not call `registerPatientWithPhoneMatch`. The node runner recorded that gate check as a pass. It is not persistence evidence.

Playwright was not started. The new browser test calls `hold()` before any page request.
