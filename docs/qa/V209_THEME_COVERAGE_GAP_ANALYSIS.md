# V2.09 / V9 Theme Coverage Gap Analysis

Branch: `V9`  
Commit: `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`  
Scope: analysis and testing only. No application code, commit, push, deployment, or production data was changed.

## Required output

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
THEME_TEST_CASES=28 (static discovery; not executed)
THEME_TEST_PASS=0 confirmed
THEME_TEST_FAIL=0 confirmed
THEME_TEST_SKIP=28 not executed
STATEMENT_COVERAGE=UNAVAILABLE
BRANCH_COVERAGE=UNAVAILABLE
FUNCTION_COVERAGE=UNAVAILABLE
LINE_COVERAGE=UNAVAILABLE
FUNCTIONAL_SCENARIOS=35
FULLY_COVERED=23
PARTIALLY_COVERED=12
MISSING=0 in the existing scenario inventory; see audit gaps below
ENVIRONMENT_BLOCKED=1 (dedicated TEST_DATABASE_URL not configured)
POSITIVE_TESTS=22 discovered
NEGATIVE_TESTS=6 discovered
P0_GAPS=0
P1_GAPS=6
P2_GAPS=4
FINAL=V209_THEME_COVERAGE_AUDIT_COMPLETE
```

The counts above distinguish static discovery from executed results. `FULLY_COVERED` and
`PARTIALLY_COVERED` are the repository's existing functional-scenario inventory values,
not a claim that this audit run executed those scenarios.

## 1. Implementation inventory

### Shared theme implementation

- `src/platform/website/themeRegistry.js` — BB/AC theme definitions, product filtering,
  defaults, render metadata, publication keys.
- `src/platform/website/websiteThemeService.js` — draft save/load, compatibility,
  preview, permission and product validation.
- `src/platform/website/websiteThemeHttp.js` — theme gallery and selection HTTP
  presentation.
- `src/platform/website/themeGalleryPageModel.js`
- `src/platform/website/renderWebsiteThemeGallery.js`
- `src/platform/website/publicWebsiteUrl.js`
- `src/platform/website/imagePlacement.js`
- `src/platform/website/permissions.js`
- `src/platform/website/instanceRepository.js`
- `src/platform/website/contentService.js`
- `src/platform/website/publicationService.js`

### Product templates, routes, services and shells

BlessBoard:

- `src/blessboard/website/blessboardChurchTemplate.js`
- `src/blessboard/http/blessboardWebsiteEditorRoutes.js`
- `src/blessboard/http/churchWebsiteAdminRoutes.js`
- `src/blessboard/http/attachWebsiteAdminChrome.js`
- `src/blessboard/services/websitePublicationVersionService.js`
- `src/blessboard/services/websitePublicationValidationService.js`
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`

ActiveClinic:

- `src/activeclinic/website/activeClinicWebsiteTemplate.js`
- `src/activeclinic/http/activeClinicWebsiteRoutes.js`
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js`
- `src/activeclinic/http/renderActiveClinicPublic.js`
- `views/activeclinic/layouts/public-shell.ejs`

Shared views and client assets:

- `views/platform/website/theme-gallery-page.ejs`
- `public/platform/website-theme-gallery.js`
- `public/platform/website-theme-gallery.css`
- `public/theme.css`
- `public/theme-colors.css`
- `public/theme-prefs.js`

Product CSS packs:

- `public/blessboard/v5/website-theme-contemporary-fellowship.css`
- `public/activeclinic/website-theme-family-wellness-mint.css`

### Database and persistence

- `db/migrations/blessboard/041_website_draft_and_publication_versions.sql`
- `db/migrations/blessboard/096_website_published_baseline_versions.sql`
- `db/migrations/blessboard/096_website_published_baseline_versions 2.sql`
- Theme state is persisted through the website content/draft and publication services
  using `site.theme_id`; the implementation also mirrors the published value into the
  BlessBoard publication `theme_key`.

## 2. Test inventory

Theme-specific files and exact test names:

`tests/v2-01-shared-theme-infra.test.js` (9):

- isolates BB and AC theme collections (no cross-product exposure)
- preserves current public layouts as product default themes
- declares supported sections and B2/B3 image slots without dropping content
- persists theme via site.theme_id draft key and rejects cross-product saves
- registers site.theme_id on BB and AC templates as editable ENUM fields
- wires draft theme APIs and draft/live presentation attrs on public shells
- mirrors published theme into BB publication theme_key without auto-publish
- scopes theme selection to HQ/branch website instance path builders
- bumps asset cache for theme infra presentation

`tests/v2-01-shared-theme-gallery.test.js` (7):

- lists only product-filtered themes with working renderers
- builds gallery cards with current/draft status and preview/select actions
- renders shared gallery markup for BB and AC product labels without cross-product cards
- wires gallery routes and Choose Theme menu for BB and AC
- keeps theme selection draft-only and supports authorized preview query overlay
- surfaces compatibility warnings and Adjust Picture link in gallery template
- documents single-theme C2 limitation in gallery UI when only one theme exists

`tests/v2-01-first-additional-themes.test.js` (5):

- registers Contemporary Fellowship and Family Wellness Mint as selectable renderers
- keeps default themes as defaults and uses distinct publication theme keys
- declares theme-specific hero framing without dropping content
- ships distinct public CSS packs and shell stylesheet hooks
- extends editable theme enums for both products

`tests/v209-theme-lifecycle.test.js` (2):

- publishes every BlessBoard theme sequentially without content loss
- publishes every ActiveClinic theme sequentially without content loss

Related management/integration tests:

- `tests/blessboard-website-management-hub-parity.test.js`: shared presentation markup;
  HQ hub actions; published/live state; branch/HQ authorization; product isolation;
  both galleries and draft-only alternate-theme saves.
- `tests/v7-website-settings-ux.test.js`: website settings/editor UX contracts
  (theme-related assertions are mixed with broader settings coverage).

Additional adjacent evidence relevant to image framing/history/permissions:

- `tests/v2-01-universal-image-editor.test.js`
- `tests/v2-01-shared-image-placement.test.js`
- `tests/v2-01-field-history-restore.test.js`
- `tests/v2-01-website-change-manager-foundation.test.js`
- `tests/v7-website-rbac.test.js`
- `tests/v7-tenant-isolation-security.test.js`
- `tests/v8-tenant-product-isolation.test.js`

Static classification of the 28 theme-specific cases: 22 positive/functional and
6 negative or safety-oriented. This is classification by assertion intent, not test
execution.

## 3. Execution results

The prescribed isolated command was attempted:

```text
NODE_ENV=test GETPRO_TEST_DB=1 node scripts/run-node-tests-with-test-db.js -- \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-01-first-additional-themes.test.js \
  tests/v7-website-settings-ux.test.js \
  tests/blessboard-website-management-hub-parity.test.js \
  tests/v209-theme-lifecycle.test.js
```

Result: blocked before test discovery/execution:

```text
[getpro] test:pg:isolated: set TEST_DATABASE_URL to your dedicated test database.
```

Therefore no PASS or FAIL result is claimed. The 28 theme-specific cases are
`SKIP/NOT EXECUTED` for this audit run; this is an environment blocker, not a
test pass.

A c8 run against the static theme tests was also started with explicit theme
implementation `--include` paths. It did not complete within the available
execution window and produced no report. Consequently all four coverage metrics
remain `UNAVAILABLE`; no V8 shared-module coverage was substituted.

## 4. Coverage

| Metric | Result |
|---|---|
| Statements | UNAVAILABLE |
| Branches | UNAVAILABLE |
| Functions | UNAVAILABLE |
| Lines | UNAVAILABLE |

No uncovered-line list is reported because c8 did not produce a valid result.
The intended theme-only c8 include set was:

`themeRegistry.js`, `websiteThemeService.js`, `themeGalleryPageModel.js`,
`renderWebsiteThemeGallery.js`, `websiteThemeHttp.js`, `publicWebsiteUrl.js`,
`imagePlacement.js`, `blessboardChurchTemplate.js`, and
`activeClinicWebsiteTemplate.js`.

This intentionally excludes shared-module aggregate coverage.

## 5. Functionality matrix

| Scenario | Classification | Evidence |
|---|---|---|
| Gallery listing | FULL | `v2-01-shared-theme-gallery`, product-filter test |
| Theme selection | FULL | gallery actions; draft-only test; infra save test |
| Draft persistence | FULL | infra save test; lifecycle test |
| Preview | FULL | gallery preview action and preview-overlay test |
| Publish | PARTIAL | lifecycle integration exists, but blocked in this run |
| Public rendering | PARTIAL | lifecycle render assertions; no browser execution |
| Content preservation | FULL | compatibility test and both lifecycle names |
| Image framing | FULL | additional-themes plus image-placement tests |
| Theme switching | PARTIAL | sequential lifecycle exists; no browser proof |
| History | PARTIAL | adjacent field-history tests, not theme-specific |
| Rollback | PARTIAL | adjacent publish/history coverage; no theme-specific rollback case |
| Permissions | FULL | forbidden save and management-hub authorization assertions |
| Tenant isolation | FULL | management hub and adjacent isolation tests |
| Product isolation | FULL | cross-product registry/save/gallery assertions |

`FULL` means there is direct automated-test evidence in the repository. `PARTIAL`
means evidence exists only through adjacent coverage, static contracts, or an
unexecuted integration/browser path.

## 6. Quality findings and gaps

### P1

1. Configure a disposable dedicated `TEST_DATABASE_URL` and rerun the six-file
   suite serially. Until then, the lifecycle, publish, rendering, tenant, and
   integration claims are not execution-confirmed.
2. Add Playwright coverage for the gallery and public render at exactly 1440,
   768, 390, and 360 pixel viewports. Current discovery found no theme-specific
   Playwright cases for these widths.
3. Add one executed end-to-end theme rollback/history case per product, asserting
   draft restoration, live-theme stability, and content preservation.
4. Complete c8 with a finite, theme-only test command and archive the generated
   JSON/text summary, including uncovered lines for every included implementation
   file.
5. Add one explicit negative integration test per product for unauthorized theme
   selection and one for cross-tenant selection, rather than relying on mixed
   management-hub coverage.
6. Add browser assertions that the selected CSS class and product CSS pack are
   actually applied after preview, publish, and reload.

### P2

1. Replace source-string-only checks in the gallery/infra tests with executed route
   requests for route registration, CSRF, response status, and rendered attributes.
2. Consolidate duplicated static-contract assertions across the V2.01 theme files
   while retaining one focused contract test per behavior.
3. Add boundary cases for zero themes, one theme, invalid theme IDs, missing
   instances, and unsupported content/image slots through public service APIs.
4. Add a test that verifies cache-busted theme CSS assets are reachable and that
   switching products cannot load the other product's stylesheet.

### Weak/stale/duplicate assessment

- Weak assertions: several V2.01 tests read source files and match regular
  expressions rather than executing routes, templates, or browser behavior.
- Stale-risk assertions: cache-buster literals and exact theme counts (`2`) can
  fail to detect a missing asset or can require manual updates when a valid theme
  is added.
- Duplicates: product filtering, default IDs, and CSS hook checks overlap between
  `v2-01-shared-theme-infra.test.js`, `v2-01-shared-theme-gallery.test.js`, and
  `v2-01-first-additional-themes.test.js`.
- No test was classified as having no assertion. Duplicate-case equivalence was
  not mechanically proven; the overlap above is an audit finding, not a claim that
  the tests are byte-for-byte duplicates.

## 7. Product isolation

The static evidence keeps BlessBoard and ActiveClinic theme IDs, templates, routes,
labels, CSS packs, and URL builders separate. No Stitch or application source was
modified by this audit. The current branch also had unrelated pre-existing working
tree modifications; they were not touched.

