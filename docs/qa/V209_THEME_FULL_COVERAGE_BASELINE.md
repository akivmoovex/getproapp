# V2.09 Theme Full Coverage Baseline

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
THEME_CASES_RECONCILED=28 exact theme cases across 4 theme-specific files; 21 static + 2 lifecycle + 5 additional-theme cases
TEST_PASS=50
TEST_FAIL=1
TEST_SKIP=0
TEST_BLOCKED=0
STATEMENT_COVERAGE=81.58%
BRANCH_COVERAGE=53.45%
FUNCTION_COVERAGE=86.66%
LINE_COVERAGE=81.58%
MEASURED_FILES=9
UNOBSERVED_FILES=none (websiteThemeHttp.js observed as an empty report: 0%)
TOP_5_GAPS=websiteThemeHttp execution; imagePlacement branches/functions; publicWebsiteUrl negative/canonical paths; websiteThemeService edge branches; real browser viewport preview/security coverage
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_FULL_COVERAGE_BASELINE_COMPLETE
```

## Executed results

- Database-independent theme regression: 21 passed, 0 failed.
- Database-backed lifecycle: 2 passed, 0 failed.
- Settings/management batch: 27 passed, 1 failed, 0 skipped.
- Security batch (`v7-website-rbac`, `v7-tenant-isolation-security`,
  `v8-tenant-product-isolation`): 20 passed, 0 failed.
- The one failure was `published church shows View live and Unpublish; drafts
  surface unpublished changes including logo` in
  `tests/blessboard-website-management-hub-parity.test.js`; fixture setup
  returned `invalid_media_url` at line 430.

## Nine-file coverage

Coverage was collected with native `NODE_V8_COVERAGE` from the passing
database-independent and lifecycle batches, then converted using the installed
c8 `Report` API. The c8 CLI was not invoked.

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `activeClinicWebsiteTemplate.js` | 98.64% | 92.85% | 75.00% | 98.64% |
| `blessboardChurchTemplate.js` | 100% | 80.55% | 100% | 100% |
| `imagePlacement.js` | 48.29% | 20.00% | 42.85% | 48.29% |
| `publicWebsiteUrl.js` | 86.90% | 44.33% | 87.50% | 86.90% |
| `renderWebsiteThemeGallery.js` | 94.59% | 66.66% | 100% | 94.59% |
| `themeGalleryPageModel.js` | 100% | 54.83% | 100% | 100% |
| `themeRegistry.js` | 97.96% | 77.19% | 100% | 97.96% |
| `websiteThemeHttp.js` | 0% | 0% | 0% | 0% |
| `websiteThemeService.js` | 90.57% | 52.11% | 100% | 90.57% |
| **All nine** | **81.58%** | **53.45%** | **86.66%** | **81.58%** |

Uncovered function highlights include `registerActiveClinicWebsiteTemplateV2`,
`clampNumber`, `normalizeFrame`, `renderPlacementStyle`,
`objectPositionFromPlacement`, several public URL canonical/admin helpers,
and the entire `websiteThemeHttp.js` module. Uncovered branch hotspots are
primarily image-placement validation/rendering, URL canonicalization, theme
registry fallback paths, and website-theme service compatibility/error paths.

## Five highest-priority remaining gaps

1. Execute `websiteThemeHttp.js` through real HTTP route tests; it currently
   contributes zero coverage.
2. Add image-placement boundary tests covering invalid frames, mobile/base
   fallback, and rendering branches.
3. Add public URL canonicalization/admin/media-library negative-path tests.
4. Add theme-service compatibility, invalid-theme, missing-instance, and
   preview-overlay error-path tests.
5. Add Playwright preview/security coverage at 1440, 768, 390, and 360 pixels.

No inventory or application files were changed by this baseline run.

