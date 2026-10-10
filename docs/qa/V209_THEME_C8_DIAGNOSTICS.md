# V2.09 Theme c8 Diagnostics

Branch: `V9`  
Scope: temporary diagnostics only. No application code, tests, database
configuration, or production data was changed.

```text
NODE_VERSION=v22.23.1
C8_VERSION=10.1.3
MINIMAL_C8=TIMEOUT (>30s); no output
ROOT_CAUSE=c8 CLI does not complete even for --version and a one-file/one-include run; the failure is at CLI/runtime invocation before valid instrumentation output, not attributable to the theme tests
COVERAGE_JSON=NOT_GENERATED
MEASURED_SOURCE_FILES=NONE
MEASURED_TEST_FILES=NONE
LINE_COVERAGE=UNAVAILABLE
BRANCH_COVERAGE=UNAVAILABLE
NEXT_ACTION=Repair or replace the local c8 invocation/runtime, then rerun the minimal command before expanding test scope
FINAL=V209_THEME_C8_DIAGNOSTICS_COMPLETE
```

## Measurements

- `node --version`: `v22.23.1`
- Installed local package: `c8@10.1.3`
- Local binary: `node_modules/.bin/c8 -> ../c8/bin/c8.js`
- `npx c8 --version`: exceeded 30 seconds.
- `node_modules/.bin/c8 --version`: exceeded 30 seconds.
- Minimal command using only `tests/v2-01-first-additional-themes.test.js` and
  `src/platform/website/themeRegistry.js`: exceeded 30 seconds with no output.
- `.tmp-theme-c8-min/coverage-final.json`: not generated.

The underlying Node test command independently completes successfully for all
three database-independent theme files (21 passing tests). The c8 process does
not reach a report-producing state, so instrumentation, open handles inside
the tests, and test concurrency cannot yet be distinguished as the cause.
The evidence currently localizes the problem to c8 CLI startup/invocation or
its runtime dependency state.

No expanded c8 invocations were attempted after the minimal invocation timed
out. No database-backed tests were attempted.

