# V13 G62 — new feature test matrix

| Feature | Unit test | Executed | HTTP | Browser |
| --- | --- | --- | --- | --- |
| Reference rule absent | `tests/v13/unit/g57-g61-configurable-features.test.js` | PASS | NOT_RUN | NOT_RUN |
| Approved rule and critical bound | same file | PASS | NOT_RUN | NOT_RUN |
| Cross-tenant, unit, conflict, version | same file | PASS | NOT_RUN | NOT_RUN |
| Interpretation retention | same file | PASS | NOT_RUN | NOT_RUN |
| Hold, release, consent, no deletion | same file | PASS | NOT_RUN | NOT_RUN |
| Manual dose unit and duplicate item | same file | PASS | NOT_RUN | NOT_RUN |
| OTP inactive, unselected provider, media name | same file | PASS | NOT_RUN | NOT_RUN |

No new integration file and no new Playwright spec were added. Persistence of migration 044 and live uploads were not executed. The database-free suite passed 486 and failed 0. The previous total was 475. Eleven new assertions are in the new unit file.

```
NEW_UNIT_TESTS=11
NEW_CONTRACT_TESTS=0
NEW_INTEGRATION_TESTS_PREPARED=0
NEW_BROWSER_TESTS_PREPARED=0
SAFE_TESTS_PASSED=486
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
```
