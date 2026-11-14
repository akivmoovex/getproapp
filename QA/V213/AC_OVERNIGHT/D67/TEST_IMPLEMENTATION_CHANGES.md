# Test implementation changes

| Change | File | Result |
|---|---|---|
| Required evidence must be `PASS` | `tests/v13/helpers/v13QaStatus.js` | `NOT_RUN` and `SKIPPED` no longer leave a required row ready |
| Hold contract | `tests/v13/contract/d67-ci-holds-contract.test.js` | Two cases. Held jobs stay off. The ActiveClinic command stays on `node --test` and does not name integration or Playwright |
| Release rows | `tests/v13/contract/v13-ci-isolation-guards.test.js` | One added case |
| Mock coverage | `tests/v13/unit/d61-evidence-validator.test.js` | One added case. A filled-in `MOCK_ONLY` PASS is rejected |

No integration file was added. The prepared browser specs were not executed. A mock or an in-memory case is not stored persistence evidence.
