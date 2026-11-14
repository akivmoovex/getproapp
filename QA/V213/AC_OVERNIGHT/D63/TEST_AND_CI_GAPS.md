# Test and CI gaps

| Task | Gap |
|---|---|
| T01, T02, T03, T05, T24 | The body or the service exists. The disposable database was not opened |
| T04 | The payment test cannot see an inverted duplicate condition |
| T06 | Stage A runs 14 cases. The file is `.github/workflows/v13-ac-qa-regression.yml` and the script is `test:v13:ac` |
| T07 | The same workflow does not require a 40-character SHA and does not upload an artifact |

Stage B, Stage C, and authenticated Stage D are `if: ${{ false }}`. A skipped job is not a passed test. The seven browser journeys throw `NOT_RUN` before a route is opened. No integration file was added. The suite stays at 13 integration files.

The D58 duplicate mutation is the test gap that is not waiting on a database. The other test gaps wait on execution approval.
