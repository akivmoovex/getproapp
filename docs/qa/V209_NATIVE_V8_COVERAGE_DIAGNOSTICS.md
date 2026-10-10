# V2.09 Native V8 Coverage Diagnostics

Branch: `V9`. No application, test, database, or package changes were made.

```text
NODE_NATIVE_COVERAGE=PASS
RAW_COVERAGE_JSON=PASS (1 file for one test; 3 files for three tests)
THEME_SOURCE_FILES_OBSERVED=6 of 9 requested
C8_DIRECT_NODE=TIMEOUT (>30s)
C8_STARTUP_BLOCKER=c8 CLI/foreground-child invocation does not terminate in this environment; native Node V8 coverage terminates normally
COVERAGE_CONVERSION_AVAILABLE=PARTIAL: local c8 conversion is present, but its CLI invocation is not currently usable
SAFE_NEXT_ACTION=Use native raw JSON plus a bounded local conversion path or repair the c8 invocation; do not claim percentage coverage from raw V8 records
FINAL=V209_NATIVE_V8_DIAGNOSTICS_COMPLETE
```

## Native V8 result

One-file command completed successfully:

```text
env -u NODE_OPTIONS NODE_V8_COVERAGE=.tmp-native-v8-one \
  node --test tests/v2-01-first-additional-themes.test.js
```

Result: 5 passed, 1 raw JSON file.

The three-file command also completed successfully:

```text
env -u NODE_OPTIONS NODE_V8_COVERAGE=.tmp-native-v8-all \
  node --test \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-01-first-additional-themes.test.js
```

Result: 21 passed, 3 raw JSON files, 478 total V8 coverage records.

Observed requested theme implementation files (6):

- `src/platform/website/imagePlacement.js`
- `src/platform/website/publicWebsiteUrl.js`
- `src/platform/website/renderWebsiteThemeGallery.js`
- `src/platform/website/themeGalleryPageModel.js`
- `src/platform/website/themeRegistry.js`
- `src/platform/website/websiteThemeService.js`

Not observed in this database-independent run (3):

- `src/platform/website/websiteThemeHttp.js`
- `src/blessboard/website/blessboardChurchTemplate.js`
- `src/activeclinic/website/activeClinicWebsiteTemplate.js`

Raw V8 output is not statement, branch, function, or line percentage coverage.

## c8 isolation

Measured local environment:

- Node: `v22.23.1`
- c8 package: `10.1.3`
- `node_modules/.bin/c8` is a symlink to `../c8/bin/c8.js`
- `NODE_OPTIONS` and `NODE_PATH` were unset.
- c8 uses `foreground-child`, `outputReport`, `parse-args`, and sets
  `NODE_V8_COVERAGE` before launching the child.

`env -u NODE_OPTIONS node node_modules/c8/bin/c8.js --version` exceeded 30 seconds.
The minimal c8 test invocation likewise previously exceeded 30 seconds, while the
same test command under native `NODE_V8_COVERAGE` completed in under one second.

This isolates the problem to the c8 CLI/child/report lifecycle in this environment,
not the test files or native V8 instrumentation. It does not prove whether the
specific hang is in `foreground-child` shutdown or report conversion; no percentage
coverage is claimed.

The smallest safe next experiment is a direct, bounded conversion of the generated
raw JSON using the already-installed c8 conversion libraries, without changing
packages or source. If that cannot terminate, retain raw JSON as diagnostic evidence
and defer percentages until the c8 CLI runtime is repaired.

