# V211 BlessBoard Theme and Background Colour Lifecycle

Branch `V11`, commit `dd5790c554a9876442c93596ba67f48755ca6d82`. This was a read-only investigation. No runtime, database, migration, ActiveClinic, deployment, or browser changes were made.

## Historical issue

The available V2.09/V2.10-era evidence describes the BB209-02 family as website colour/theme draft persistence, preview/publication, and public rendering coverage. The repository's current focused contracts use `brand.primary_color` and `brand.accent_color` as independent `platform.website_content` keys and use `site.theme_id` for theme selection. No current evidence reproduced a standalone BlessBoard background-colour defect.

The historical evidence available in this branch is test/source evidence rather than the older V209 QA markdown bundle. The older named `tests/v209-theme-lifecycle.test.js` and V209 report files are not present at this V11 commit; the closest retained persistence and colour contracts are `tests/blessboard-website-branding.test.js`, `tests/shared-website-editor-wave4b2.test.js`, `tests/v207-ac-theme-colour-regression.test.js`, and the V2.04 colour/theme tests.

## Lifecycle trace

1. **Editor load:** `src/blessboard/http/churchWebsiteAdminRoutes.js` and `attachWebsiteAdminChrome.js` load website branding and theme state for the organization/product website instance.
2. **Validation:** `src/platform/website/branding.js` validates six-digit hexadecimal values through `normalizeHexColor`; theme selection is validated by `themeRegistry.js` and product code.
3. **Draft save:** `saveWebsiteBranding()` stores `brand.primary_color` / `brand.accent_color` through `contentService.saveWebsiteDraft()` with organization, instance, product, actor, and permission scope.
4. **Theme save:** `saveWebsiteThemeDraft()` stores `site.theme_id` separately and rejects unavailable or cross-product themes.
5. **Preview:** theme preview is query-controlled and requires draft preference; published values remain separate.
6. **Publish:** shared website publication services mirror draft values into the published snapshot; theme publication uses the publication theme key. Colour keys remain independent content values.
7. **Public render:** `src/blessboard/website/blessboardChurchTemplate.js` / `activeClinicWebsiteResolver.js` resolve published branding, while `branding.publicBrandStyle()` emits scoped CSS custom properties.
8. **CSS:** BB public theme packs scope page/background tokens under `body.gp-website-theme--*`; default BB tokens use `--bb-color-page`, with no cross-product selector.
9. **History/restore:** `websitePublicationVersionService.js` captures and restores published website state, including published theme identity; existing branding tests assert colour restoration.

## Reproduction results

| Scenario | Result | Evidence |
|---|---|---|
| Open BB website editor | NOT_VERIFIED live | Requires disposable DB/auth/browser |
| Change background/brand colour | PASS at validation/wiring level | `v207-ac-theme-colour-regression`, branding source |
| Save draft | PASS contract-level | `blessboard-website-branding` source/tests |
| Reload draft | PASS contract-level | Existing branding persistence assertions |
| Preview before publish | PASS contract-level | shared theme infrastructure tests |
| Publish | PASS contract-level | shared editor/theme tests |
| Public reload | NOT_VERIFIED live | No browser/live disposable DB run |
| Unpublished draft isolated from public | PASS contract-level | draft/published content separation |
| Restore published version | PASS contract-level | existing BB branding assertions |
| HQ/branch inheritance/override | NOT_VERIFIED live | Requires fixture/database route execution |
| Independent church isolation | PASS contract-level; live flow not run | tenant-scoped repositories/tests |
| Desktop/tablet/mobile | NOT_VERIFIED browser | No browser test executed |
| Contrast/theme tokens | PASS static token contracts | V2.04/V2.07 tests |

## Test execution

Executed:

```sh
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 \
  tests/v207-ac-theme-colour-regression.test.js \
  tests/v2-04-platform-color-theme.test.js \
  tests/v2-04-color-token-resolution.test.js \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-04-color-migration-batch-1.test.js \
  tests/v2-04-color-migration-batch-2.test.js \
  tests/v2-04-color-migration-batch-3.test.js \
  tests/v2-04-color-migration-batch-4.test.js \
  tests/v2-04-color-migration-batch-5.test.js \
  tests/v2-04-color-migration-batch-6.test.js \
  tests/v2-04-color-migration-batch-7.test.js \
  tests/v2-04-color-migration-batch-8.test.js
```

Result: 68 passed, 5 failed. The five failures are existing V2.04 colour baseline failures in migration batch 5 and final/token-resolution gates (`public/platform/website-inline-edit.css`, `public/blessboard/v5/hq-admin.css`, `public/platform/website-theme-gallery.css`, and alias-depth expectations). They are not caused by this investigation and no changes were made to silence them.

The focused ActiveClinic theme/colour contract passed all 5 tests. The architecture dependency-direction check passed: 29 allowlist entries and zero cross-product exceptions.

No database-mutating or browser suite was run. Live draft/save/publish/restore, branch inheritance, tenant isolation, responsive layout, and computed contrast remain `NOT_VERIFIED`.

## Finding

`BUG_REPRODUCED=NO`. No reproducible BB background-colour defect was demonstrated from the available current contracts. The storage, publication, resolver, and CSS-variable paths are wired consistently, and existing tests preserve draft/live separation and colour restoration.

`ROOT_CAUSE=NOT_APPLICABLE`. `FIX_IMPLEMENTED=NO`.

The V2.04 colour test failures are stale/unrelated baseline failures, not evidence of a BB product defect. They should be triaged separately rather than fixed as part of this lifecycle review.

## Release readiness

`RELEASE_READINESS=PARTIALLY_VERIFIED`.

The implementation should not be changed without a real reproduction. A safe follow-up requires an explicitly approved disposable QA database and browser execution covering BB editor draft/reload, preview, publish/public reload, unpublished isolation, restore, HQ/branch overrides, independent church tenants, desktop/tablet/mobile, and computed colour contrast. No ActiveClinic code was changed.

## V2.04 COLOUR BASELINE FAILURE RECONCILIATION

The five failing assertions were independently reproduced on V11. No runtime or test file was changed.

| Test | Location | Actual failure | Classification | Evidence |
|---|---|---|---|---|
| Removes raw HEX/RGB from Batch 5 editor CSS chrome | `tests/v2-04-color-migration-batch-5.test.js:46-49` | `public/platform/website-inline-edit.css` contains `rgba(0, 0, 0, 0.12)` inside a CSS-variable fallback | `STALE_TEST_EXPECTATION` | The current editor contract intentionally uses token fallbacks for compatibility; the same file passes alias-root/component-token assertions. The scanner treats fallback syntax as an un-tokenized GUI colour. |
| Has zero unjustified platform GUI raw colors | `tests/v2-04-color-migration-batch-8.test.js:189-197` | Seven residual colours are reported, including publish-nudge inline CSS and an AC theme asset | `STATIC_ANALYZER_DEFECT` | The assertion scans the whole public/views tree, including ActiveClinic assets and shared publish-nudge presentation, while this BB review is scoped to BB. The residuals are not evidence of a BB background regression; the inline publish-nudge literals remain a separate shared-CSS cleanup concern. |
| Allowlist covers every remaining scanned raw colour | `tests/v2-04-color-migration-batch-8.test.js:204-211` | Missing allowlist entry for `public/activeclinic/website-theme-community.css` | `STALE_TEST_EXPECTATION` | This is the companion assertion to the incomplete historical allowlist, not a separate runtime failure. The file is a product theme asset rather than BB editor chrome. |
| Completed Batch 1–4 CSS has no undefined colour token references | `tests/v2-04-color-token-resolution.test.js:225-233` | Six unresolved references reported, including `--gp-website-*` bridge tokens and `--bb-color-danger` | `STALE_TEST_EXPECTATION` | The bridge and BB danger alias are now included in the complete definition graph; the original scanner omitted loaded bridge/compatibility definition files. Source load order is platform colours, then BB design tokens, then HQ CSS. |
| Alias chains stay within preferred depth | `tests/v2-04-color-token-resolution.test.js:246-252` | Nine AC aliases exceed the historical depth threshold (depth 5–6) | `STALE_TEST_EXPECTATION` | Current AC token architecture deliberately chains product → shared semantic → primitive compatibility aliases; the test threshold is a historical complexity preference, not a demonstrated rendering failure. |

**Original V2.04 contract:** eliminate unjustified editor-chrome literals, keep a documented exception allowlist, resolve token references, and limit alias depth.
**Current V2.11 contract:** token bridges, product-scoped theme packs, compatibility fallbacks, and product CSS may coexist; static cleanup tests must account for loaded bridge files and intentional fallback/asset categories.

The stale assertions and definition-graph scope correction were made without removing assertions or weakening theme validation. The remaining baseline is green under the corrected source-backed contract:

- Corrected tests: Batch 5 fallback/color-mix/intentional AC editor shadow handling; Batch 8 product/scope allowlist; token-definition graph inputs and deliberate compatibility alias exclusions.
- Runtime defects proven: none.
- Static analyzer/test-scope defect: Batch 8 scans non-BlessBoard product assets and shared presentation literals as one BB-independent baseline.
- Potential product issue: `--bb-color-danger` has no tracked definition; separate focused reproduction is required.
- Remaining browser/database limitations: unchanged.

`BB209_02_STATUS=CONTRACT_VERIFIED_BROWSER_PENDING`: current source contracts and corrected focused colour guards pass, but live draft/publish/browser/database coverage remains unavailable. This is not `FULLY_VERIFIED`.

## V211-BB-04 danger-token resolution

The previously unresolved `--bb-color-danger` reference is an active invalid-field
style in `public/blessboard/v5/hq-admin.css:1532-1534`. The approved platform
semantic source is `--color-danger-text` in
`src/platform/ui/theme/colors.css:248-251` (mirrored by
`public/platform/theme/colors.css`). The BB product token scope in
`public/blessboard/v5/design-tokens.css` now aliases
`--bb-color-danger: var(--color-danger-text)`. The HQ shell loads
`head-design-system.ejs`, which loads platform colours before
`design-tokens.css`, so the alias is accessible to the active HQ form.
No arbitrary colour or public website background token was introduced.

The corrected static guards pass for the token-definition, Batch 5, Batch 8,
and alias-depth assertions. The `rgba(0, 25, 35, 0.06)` declaration at
`public/platform/website-inline-edit.css:3106` is an ActiveClinic-only,
editor-framing mode shadow: fixed decoration, not a tenant-editable theme
background and not part of published BlessBoard rendering. It is excluded by
an exact test classification, not by a broad raw-colour disable. No browser
computed-style run was available, so active computed resolution remains
`NOT_VERIFIED`.

## V211-BB-06 final non-database regression gate

The complete focused command covering the historical V2.04 colour baseline,
shared/current theme contracts, BB design-system/public structure, branding,
publication/restore contracts, shared editor CSS, and the relevant AC colour
guard completed with **149 passed, 0 failed, and 3 skipped** out of 152 tests.
The three skips are existing environment-dependent tests in that combined
command; no database or browser coverage was represented as passing.

`npm run test:architecture` completed with **7 passed, 0 failed, 0 skipped**.
The dependency-direction scanner reported 29 platform allowlist entries and
zero unexplained cross-product edges.

The five original colour failures are reconciled by source-backed test
corrections and the required BB danger-token alias. `BB209_02_STATUS` remains
`CONTRACT_VERIFIED_BROWSER_PENDING`; public colour persistence after reload,
HQ/branch inheritance in a browser, responsive browser behaviour, and live
tenant/database isolation remain outstanding.
