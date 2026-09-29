# V2.04 QA Test Inventory

**Branch:** V4  
**Updated:** 2026-09-30  
**Purpose:** Record automated coverage for V2.04 release hardening. Do not inflate counts by treating parameterized cases as separate capabilities.

| Test file | Area | Product | Pos/Neg | Auto/Manual | Result |
|-----------|------|---------|---------|-------------|--------|
| `tests/v8-about-version-2.test.js` | About Version 2.04 + Git build (BB+AC routes) | Shared / BB / AC | + | Automated | PASS (local) |
| `tests/v2-04-release-hardening.test.js` | Version, release notes, theme isolation, engine singularity, coverage inventory | Shared / AC | + / − | Automated | PASS (local) |
| `tests/v2-04-product-token-cascade.test.js` | Computed AC teal / BB violet product cascade | Shared | + / − | Automated | PASS |
| `tests/v2-04-platform-color-theme.test.js` | Platform color theme contract | Shared | + | Automated | PASS |
| `tests/v2-04-color-token-resolution.test.js` | Token resolution | Shared | + | Automated | PASS |
| `tests/v2-04-color-migration-batch-*.test.js` | Color migration batches 1–8 | Shared | + | Automated | PASS |
| `tests/v2-04-qa-01-shared-registration-location.test.js` | Country + City registration | Shared / BB / AC | + / − | Automated | PASS |
| `tests/v2-04-qa-02-platform-city-catalogue.test.js` | DB city catalogue | Shared | + / − | Automated | PASS |
| `tests/v2-04-qa-03-platform-country-availability.test.js` | Registration country availability | Shared | + / − | Automated | PASS |
| `tests/v2-04-shared-website-components.test.js` | Shared website components | Shared | + | Automated | PASS |
| `tests/v2-04-platform-website-presentation.test.js` | Presentation model | Shared | + | Automated | PASS |
| `tests/v2-04-ac-website-presentation-adapter.test.js` | AC presentation adapter | AC | + | Automated | PASS |
| `tests/v2-04-shared-website-media-hardening.test.js` | Shared media / upload | Shared | + | Automated | PASS |
| `tests/v2-04-platform-admin-website-console.test.js` | Platform Admin website console | Shared | + / − | Automated | PASS |
| `tests/v2-04-mini-website-repeat-edit.test.js` | Editor concurrency / repeat save | Shared / AC | + / − | Automated | PASS |
| `tests/v2-04-ac-stitch-batch-2-public-foundation.test.js` | R01–R03 public foundation | AC | + | Automated | PASS |
| `tests/v2-04-ac-stitch-batch-3-domain-pages.test.js` | R04–R08 domain pages | AC | + | Automated | PASS |
| `tests/v2-04-ac-stitch-batch-4-extended-pages.test.js` | R09–R12 extended pages | AC | + | Automated | PASS |
| `tests/v2-04-ac-stitch-batch-5-inline-editor.test.js` | E01–E02 inline editor | AC | + | Automated | PASS |
| `tests/v2-04-ac-stitch-batch-6-website-hub.test.js` | H01–H06 website hub | AC | + / − | Automated | PASS |
| `tests/v2-04-static-asset-version.test.js` | Static asset cache-bust | Shared | + | Automated | PASS |
| `npm run test:v203:bb-regression` | BB full relevant regression | BB | + / − | Automated | PASS (274 pass / 0 fail / 5 skip — PG foundation skips pre-existing) |
| `npm run test:activeclinic:v7-regression` | AC full relevant regression | AC | + / − | Automated | PASS (107/107) |

## Gates (release hardening)

| Gate | Expected |
|------|----------|
| `BB_ABOUT_VERSION` / `AC_ABOUT_VERSION` | `2.04` |
| `SHARED_VERSION_SOURCE` | YES (`applicationBuildInfo.js`) |
| `AC_PRIMARY_BRAND` | `#006068` |
| `BB_PRIMARY_BRAND` | `#6c5ce7` |
| `BB_TOKEN_LEAK_INTO_AC` | 0 |
| `AC_TOKEN_LEAK_INTO_BB` | 0 |
| `NEW_UNJUSTIFIED_GUI_RAW_COLORS` | 0 |
| `SHARED_EDITOR_ENGINE_COUNT` | 1 |
| `SHARED_UPLOAD_ENGINE_COUNT` | 1 |
| `DUPLICATE_*_ENGINE` | 0 |
| Deploy | **NOT** performed (`NEUNIVERSITY_DEPLOYMENT=PENDING`) |
