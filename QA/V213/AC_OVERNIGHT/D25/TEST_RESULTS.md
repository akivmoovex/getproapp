# Test results

Safe suite started `2026-11-14T23:30:42+0200` and finished `2026-11-14T23:30:45+0200`. Exit 0.

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

`DATABASE_URL` was unset. Write flags and the browser flag were `0`.

| Result | Count |
|---|---|
| Tests | 208 |
| Passed | 208 |
| Failed | 0 |

New appointment tests inside that run: 6 unit and 5 contract.

`tests/v13/integration/d25-appointment-concurrency.integration.test.js` was run separately. It printed `V13_RESULT=NOT_RUN` and did not enter the body. The node pass for that gate is not a concurrency pass.

No browser test was launched. No appointment row was written.
