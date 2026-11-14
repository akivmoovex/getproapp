# Test assertion quality

The inventory is the 89 V13 test files: 47 ActiveClinic, 21 shared, and 21 BlessBoard. This audit scores the 47 ActiveClinic files, which contain 142 cases. None of them writes a row. `d17-bb-behavior.test.js` and `v13-bb-qa-regression.spec.js` are BlessBoard and are not in these 142.

| Kind | Files | Cases | What a pass means |
|---|---|---|---|
| Function result with a fake database | 18 | 60 | The service returned the expected code for rows the test invented |
| HTTP handler with a query double | 1 | 10 | `d22-ac05-admin-denial.test.js` mounted the admin router. It is not a signed-in browser session |
| Pure function | 1 | 4 | A policy object returned the expected action. No patient was stored |
| Source string | 22 | 56 | A file still contains the expected text. The database was not asked |
| Gated integration | 4 | 5 | The gate returned `NOT_RUN` and the test passed. The scenario body did not run |
| Browser | 1 | 7 | `v13-ac-platform-qa.spec.js` throws `NOT_RUN` until the browser flag and a guarded URL are set |

Seventy-four cases execute product code. Fifty-six only read source. The five gated cases and seven browser cases record a hold. Local G1 runs 130 of the 142 ActiveClinic cases. It does not run the integration files or the browser spec.

A source assertion can fail if someone deletes `organization_id` from the file. It stays green if a different function writes the row, or if Postgres never receives the statement. A fake query stays green when the test’s `if (text.includes(...))` branch returns the row the assertion expects.

No `it.skip`, `test.skip`, or `assert.ok(true)` was found in `tests/v13`. The passing integration files are not skipped. They finish successfully while the body is unrun.
