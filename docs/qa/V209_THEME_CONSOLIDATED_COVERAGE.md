# V2.09 Consolidated Theme Coverage

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
UNIQUE_TEST_PASS=35
UNIQUE_TEST_FAIL=0
UNIQUE_TEST_SKIP=0
FILES_MEASURED=9
STATEMENT_COVERAGE=90.04%
BRANCH_COVERAGE=61.24%
FUNCTION_COVERAGE=90.52%
LINE_COVERAGE=90.04%
IMAGE_PLACEMENT_BRANCH=70.58%
PUBLIC_URL_BRANCH=47.44%
THEME_SERVICE_BRANCH=52.11%
THEME_HTTP_BRANCH=100%
TOP_5_REMAINING_GAPS=websiteThemeHttp real HTTP execution; public URL canonical/admin/media-library branches; websiteThemeService error/preview branches; image placement rendering/mobile branches; browser viewport and anonymous/cross-tenant preview cases
PRODUCT_DEFECTS=NONE_IDENTIFIED
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_CONSOLIDATED_COVERAGE_COMPLETE
```

## Scope and reconciliation

The single native-V8 batch executed these six files without duplicate counting:

- `tests/v2-01-shared-theme-infra.test.js` — 9
- `tests/v2-01-first-additional-themes.test.js` — 5
- `tests/v2-01-shared-theme-gallery.test.js` — 7
- `tests/v209-theme-http.test.js` — 5
- `tests/v209-theme-boundaries.test.js` — 7
- `tests/v209-theme-lifecycle.test.js` — 2

Result: 35 unique passing tests, zero failures and zero skips. The lifecycle
tests used the verified local ephemeral foundation mechanism.

## Coverage method

Raw native V8 records were collected into `.tmp-v209-consolidated-v8` and
converted with the installed c8 `Report` API into
`.tmp-v209-consolidated-report/coverage-final.json`. The hanging c8 CLI was not
used. Repeated module records from the same test process were merged by the
reporting API.

The measured result exceeds the proposed 90% line target and 90% function
target, but is below the proposed 85% branch target. The line result is only
0.04 percentage points above target and should not be treated as broad
behavioral completeness.

Remaining uncovered functions include `presentThemeState`,
`saveThemeDraftHttp`, and `loadThemeGalleryPresentation` in
`websiteThemeHttp.js`, plus public URL canonical/admin/media-library helpers.
The largest branch gaps are in public URL routing, theme-service error/preview
paths, and image-placement rendering/mobile fallback paths.

