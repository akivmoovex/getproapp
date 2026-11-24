# V2.13.2 G131 — version verification

`PRODUCT_VERSION_V8` and `VERSION_BASE_V8` in `src/platform/build/applicationBuildInfo.js` are `2.13.2`.

BlessBoard `views/blessboard/v5/apex/about.ejs` and ActiveClinic `views/activeclinic/public/about.ejs` display 2.13.2.

`VERSION_ORDER` ends at `2.13.2` and still contains `2.13` and `2.13.1`. The 2.13.1 catalog entry was not rewritten.

Release notes: `docs/releases/V2.13.2_RELEASE_NOTES.md`.

Version tests that passed in the database-free suite:

- `tests/v8-about-version-2.test.js`
- `tests/about-v11-platform.test.js`
- `tests/v212-version-initialization.test.js`
- `tests/v13/unit/d17-platform-http-behavior.test.js`

QA is NO-GO. This is a development candidate, not a release.
