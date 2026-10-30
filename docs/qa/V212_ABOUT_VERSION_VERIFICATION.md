# V2.12 About Version Verification

## Result

`VERIFIED_STATIC` for the V12 source baseline. Both About templates and the shared build metadata select version `2.12`.

## Evidence

- Initial V12 SHA: `7a6c68d948f16d1f282531fbf7f6716dccfeefde`
- Shared source: `src/platform/build/applicationBuildInfo.js`
- BlessBoard source: `views/blessboard/v5/apex/about.ejs`
- ActiveClinic source: `views/activeclinic/public/about.ejs`
- Release catalog: `src/platform/release-notes/releaseNotesCatalog.js`
- Version tests: `tests/v212-version-initialization.test.js`, `tests/about-v11-platform.test.js`

The templates preserve environment and build metadata supplied through `buildInfo`; the Git SHA remains a separate `build` value and is not fabricated.

## Test result

`tests/v212-version-initialization.test.js`: PASS (2/2).

`tests/about-v11-platform.test.js` and `tests/v211-version-legacy-route-contract.test.js`: BLOCKED during module loading because dependencies are not installed in the isolated worktree (`Cannot find module 'express'`). No application server or database was started.

Historical release entries remain in the catalog, including V2.03, V2.10, and V2.11.
