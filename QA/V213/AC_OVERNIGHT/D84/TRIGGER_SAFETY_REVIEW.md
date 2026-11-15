# Trigger safety review

The current hold is the assertion that a `push` key is absent. It is still active in five places:

| Location | Assertion |
|---|---|
| `v13-ac-qa-regression.yml` line 54 | `! grep -E '^\s+push:'` |
| `v13-platform-qa-regression.yml` line 55 | `! grep -E '^\s+push:'` |
| `tests/v13/contract/d18-ci-readiness.test.js` line 43 | `/^\s*push:/m` is false for all four V13 workflows |
| `tests/v13/contract/d19-qa-implementation.test.js` line 81 | the same, inside the test named so a `V13` push does not start CI |
| `tests/v13/contract/d67-ci-holds-contract.test.js` line 21 | the same for the ActiveClinic workflow |

Those five checks passed in `/tmp/d84-holds.log` (9 tests, 0 failed). None of them was removed.

The approved narrowing, and only that narrowing, is:

- ActiveClinic and platform workflows may contain one `push` key whose branch list is `[V13]`.
- BlessBoard workflows still may not contain `push`.
- `ci.yml` still may not list `V13`.
- `pull_request` and `schedule` stay absent.
- `enable_db_stages` stays out of every job `if`.
- Both write flags stay `"0"`.
- Database, browser, and authenticated-session jobs stay `if: ${{ false }}`.

A push to `main`, `v2`, or `V7` still does not select these workflows. No deploy workflow is added.
