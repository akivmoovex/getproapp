# G2 and G3 execution blockers

Neither gate was run. Both write flags and the browser flag are `0`. No database URL was set.

| Gate | Prepared | Blocker |
|---|---|---|
| G2 | 13 files named `*.integration.test.js` | Each file returns before `openPool` while the flags are `0`. The appointment file still throws if the gate opens because capacity is unapproved |
| G3 | 7 tests in `tests/e2e/v13/v13-ac-platform-qa.spec.js` | Each test calls `hold()` before a page action. `hold()` throws `NOT_RUN` until the browser flag and a guarded `E2E_DATABASE_URL` are already set |

The browser file does not contain a stored-patient assertion that has been executed. The integration files do not contain a persistence result from this stage. `v13AuthorizedScenarios.js` is a helper, not a fourteenth integration file.
