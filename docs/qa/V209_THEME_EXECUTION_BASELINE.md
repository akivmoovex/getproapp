# V2.09 Theme Test Execution Baseline

Branch: `V9`  
SHA: `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
THEME_TESTS_DISCOVERED=28
PASS=21
FAIL=0
NOT_EXECUTED=7
ENV_BLOCKED=TEST_DB_BLOCKED
LINE_COVERAGE=UNAVAILABLE
BRANCH_COVERAGE=UNAVAILABLE
FUNCTION_COVERAGE=UNAVAILABLE
STATEMENT_COVERAGE=UNAVAILABLE
TOP_UNCOVERED_FUNCTIONS=UNAVAILABLE
NEXT_REQUIRED_ACTION=Provide a dedicated disposable TEST_DATABASE_URL, then rerun DB batches and c8
FINAL=V209_THEME_EXECUTION_BASELINE_COMPLETE
```

## Database check

`TEST_DATABASE_URL` was not configured. `DATABASE_URL` was not inspected or used as a
fallback. No database was provisioned, reset, or mutated.

Result: `TEST_DB_BLOCKED`.

## Executed database-independent batch

Command:

```text
NODE_ENV=test node --test \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-01-first-additional-themes.test.js
```

Result: `PASS=21`, `FAIL=0`, `SKIP=0`.

The 21 passing cases are the 9 infrastructure, 7 gallery, and 5 additional-theme
cases listed in the preceding audit.

## Database-dependent and related tests

Not executed because no dedicated test database was available:

- `tests/v209-theme-lifecycle.test.js` — 2 theme lifecycle cases.
- Database-backed portions of `tests/v7-website-settings-ux.test.js`.
- Database-backed portions of `tests/blessboard-website-management-hub-parity.test.js`.

The two theme-specific lifecycle cases account for the remaining 2 of the 28
theme-specific cases. The related files were not counted as additional theme cases
because they contain broader website-management coverage.

## c8 coverage

The requested c8 command used explicit `--include` paths for these nine files:

```text
src/platform/website/themeRegistry.js
src/platform/website/websiteThemeService.js
src/platform/website/themeGalleryPageModel.js
src/platform/website/renderWebsiteThemeGallery.js
src/platform/website/websiteThemeHttp.js
src/platform/website/publicWebsiteUrl.js
src/platform/website/imagePlacement.js
src/blessboard/website/blessboardChurchTemplate.js
src/activeclinic/website/activeClinicWebsiteTemplate.js
```

The finite database-independent c8 batch did not terminate within 30 seconds and
was stopped. It produced no valid JSON coverage artifact or summary. Therefore
percentages and uncovered functions/branches are not reported. No shared-module
or repository-wide V8 coverage was substituted.

## Follow-up

Configure `TEST_DATABASE_URL` to a known disposable test database, verify its
identity independently, then run the lifecycle and related database-backed batches
serially. Re-run c8 in a finite compatible invocation and retain its JSON output
before adding any new tests.

