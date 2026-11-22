# V13 G51 — test coverage

Added `tests/v13/unit/g47-encounter-handoff.test.js`. It asserts which department URLs are returned for a granted permission set, and that an empty grant returns no links. It also checks that the encounter template prints each link only inside its `links.*` condition.

Extended `tests/v13/unit/g05-records.test.js`. A batch open with document-create authorization still builds an insert without `DELETE`. The same call without authorization returns `access_denied` and does not query.

No integration file and no Playwright spec was added. D19 stays at 18 integration files, 18 ActiveClinic browser names, and 23 BlessBoard browser names. Those gated suites were not run. `NOT_RUN` is not a pass.

The full database-free suite passed 475 and failed 0, with 0 skipped. The previous total was 471.

```
NEW_UNIT_TESTS=4
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
SAFE_TESTS_PASSED=475
SAFE_TESTS_FAILED=0
```
