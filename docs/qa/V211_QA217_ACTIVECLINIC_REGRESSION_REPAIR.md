# V211-QA217 ActiveClinic Regression Repair

Date: 2026-10-29  
Branch: `fix/v211-qa-bug-resolution`  
Previous HEAD: `f89471f0c1049288300ecf65986959ead1041439`

## Reproduced failures

All three reported failures came from `tests/v7-website-public-catalogue.test.js`
and reproduced independently against the disposable local foundation database.
They were stale test expectations, not product defects:

1. `lets a clinic admin enable, publish, hide, and isolate canonical doctors
   and services` expected the retired `data-ac-website-action="catalogue"`
   hub marker and the service object property `displayName`.
2. `walks registration through catalogue publish, hide, and restore without
   Platform Admin` expected the retired `Public Catalogue` hub text.
3. `lets website editors create, edit, disable, and publish catalogue services`
   expected `listWebsiteServices()` results to expose `displayName`.

The current contracts expose the website hub marker
`data-ac-website-hub="1"`, the current hub navigation, and public catalogue
service names as `name`. The application behavior and database writes were
correct.

## Changes

Updated only the regression assertions in
`tests/v7-website-public-catalogue.test.js`:

- Assert the current website hub marker.
- Remove the obsolete hub-link/text assumptions; the catalogue route is
  exercised directly by the same suite.
- Assert the public-safe `name` field returned by the projection layer.

No ActiveClinic runtime code, database schema, hosted environment, production
system, or deployment was changed.

## Verification

- Previously failing catalogue suite: `7/7 PASS`.
- Full ActiveClinic V7 regression: `108/108 PASS` across 14 files.
- Related shared website persistence suite: `5/5 PASS`.
- Related ActiveClinic 390px suite: `0/1 PASS`; it still reports a small
  `history-link` target and remains separately unresolved.
- BlessBoard regression: `272 PASS / 2 FAIL`; both failures are in the
  pre-existing `tests/blessboard-hq-shell.test.js` branch-selector scenarios.
- Platform security regression: `28/28 PASS`.
- Application build: PASS.
- `git diff --check`: PASS.

The two BlessBoard failures and the unrelated ActiveClinic 390px accessibility
failure were not suppressed or altered. No hosted browser verification was
attempted; hosted authentication remains unavailable.

## Classification

- `PRODUCT_DEFECTS_CONFIRMED=0`
- `PRODUCT_FIXES=0`
- `TEST_FIXES=3 stale expectations`
- `REMAINING=1 related ActiveClinic visual test failure; 2 BlessBoard shell failures`
- `DATABASE_MUTATION=NO`
- `HOSTINGER_MUTATION=NO`
- `PRODUCTION_MUTATION=NO`
- `V11_UNCHANGED=YES`
