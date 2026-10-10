# V2.09 Theme Coverage Measurement

Branch: `V9`. Measurement used the existing native V8 files in
`.tmp-native-v8-all/`; no application, test, dependency, database, or configuration
changes were made.

```text
RAW_JSON_VALID=YES (3 files; 478 raw V8 records)
CONVERSION_STATUS=VALID via local c8 Report API; c8 CLI not invoked
OBSERVED_SOURCE_FILES=6
UNOBSERVED_SOURCE_FILES=3
PARTIAL_STATEMENT_COVERAGE=58.57%
PARTIAL_BRANCH_COVERAGE=58.42%
PARTIAL_FUNCTION_COVERAGE=41.55%
PARTIAL_LINE_COVERAGE=58.57%
FULL_NINE_FILE_COVERAGE=UNAVAILABLE
LOWEST_COVERED_FILES=imagePlacement.js; publicWebsiteUrl.js; websiteThemeService.js
NEXT_ACTION=Exercise the three unobserved files through database-independent or dedicated-test-database paths, then repeat the same bounded Report API conversion
FINAL=V209_THEME_COVERAGE_MEASUREMENT_COMPLETE
```

## Scope

The valid converted JSON artifact is `.tmp-theme-converted-six/coverage-final.json`.
The metrics are only for the six observed implementation files:

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `imagePlacement.js` | 39.11% | 80.00% | 14.28% | 39.11% |
| `publicWebsiteUrl.js` | 45.75% | 44.00% | 25.00% | 45.75% |
| `renderWebsiteThemeGallery.js` | 94.59% | 66.66% | 100.00% | 94.59% |
| `themeGalleryPageModel.js` | 100.00% | 54.83% | 100.00% | 100.00% |
| `themeRegistry.js` | 97.96% | 76.78% | 100.00% | 97.96% |
| `websiteThemeService.js` | 52.04% | 46.66% | 57.14% | 52.04% |
| **Six-file total** | **58.57%** | **58.42%** | **41.55%** | **58.57%** |

Unobserved from the intended nine-file scope:

- `src/platform/website/websiteThemeHttp.js`
- `src/blessboard/website/blessboardChurchTemplate.js`
- `src/activeclinic/website/activeClinicWebsiteTemplate.js`

They were not silently treated as zero and are excluded from the six-file
denominator. Therefore no full nine-file percentage is reported.

## Lowest coverage and uncovered functions

Lowest statement/line coverage:

- `imagePlacement.js`: 39.11%; uncovered functions include
  `clampNumber`, `normalizeFrame`, `validateImagePlacement`,
  `placementFromImageValue`, `renderPlacementStyle`, and
  `objectPositionFromPlacement`.
- `publicWebsiteUrl.js`: 45.75%; most URL builder and canonical redirect
  functions were not reached by the three gallery/infra tests.
- `websiteThemeService.js`: 52.04%; uncovered functions include
  `unwrapThemeValue`, `previewThemeIdFromInput`, and `loadWebsiteThemeState`.

Other uncovered lines reported by the valid conversion:

- `renderWebsiteThemeGallery.js`: lines 22–23.
- `themeRegistry.js`: lines 210, 217, and 271–274.
- `websiteThemeService.js`: lines 29–42, 97–168, 180–181, 186–208,
  and 212–221.

The raw V8 source records were converted through the installed c8 library's
`Report` API, without running `bin/c8.js` or `foreground-child`. The resulting
JSON contains standard Istanbul-compatible statement, branch, function, and
line maps, so the six-file percentages are measured rather than inferred.

