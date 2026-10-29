# V211-QA218 Final Regression Repair

Date: 2026-10-29  
Branch: `fix/v211-qa-bug-resolution`  
Previous HEAD: `ae097a65294f663cbfde7b2bf4baabee23a73dc6`

## Failure investigation

### ActiveClinic 390px

`tests/v7-website-catalogue-390px.test.js` failed because
`/app/settings/website` rendered the `history-link` action below the 44px
minimum touch target. Chromium used the configured 390px viewport and reported
no horizontal overflow; this was a genuine mobile usability defect.

Correction: `public/activeclinic/website-cms.css` now gives the hub history
action an inline-flex layout, centered content, padding, and a 2.75rem minimum
height. The focused Chromium test passes.

### BlessBoard HQ failure 1

`tests/blessboard-hq-shell.test.js`, `branch selector link opens branch-admin
only when authorized`, expected `/hq/branches/campus-north` to return a 303
redirect and expected the registry to expose an `active-branches` count.

The current canonical route renders the authorized branch registry/detail
context with HTTP 200, exposes `data-bb-count="all-branches"`, and the
separate `/branch-admin` authorization check returns 200. The test expectations
were stale. Assertions now match the current route and count contract.

### BlessBoard HQ failure 2

The same test file's `HQ branch registry search and type filter use
church-scoped active list only` expected the retired `active-branches` marker
on the no-results page. The current registry contract uses
`data-bb-count="all-branches"`. The assertion was updated; church scoping,
filtering, and no-results assertions remain unchanged.

## Verification

- ActiveClinic 390px focused test: `1/1 PASS`.
- BlessBoard HQ shell focused test: `9/9 PASS`.
- ActiveClinic full V7 regression: `108/108 PASS` across 14 files.
- BlessBoard relevant regression: `274 PASS / 0 FAIL` (279 tests; 5 skipped).
- Platform security tests: `28/28 PASS`.
- Application build: PASS.
- `git diff --check`: PASS.
- Lint diagnostics for changed files: none.

No database, Supabase, Hostinger, production, V11, or deployment changes were
made. Hosted authenticated browser QA remains blocked by unavailable authorized
sessions.
